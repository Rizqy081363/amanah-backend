import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  queueTickets,
} from '../../../../database/schema';
import {
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../../appointments/domain/constants/appointment-lifecycle.constants';
import { RedisService } from '../../../../common/redis/redis.service';
import { REALTIME_GATEWAY_PORT } from '../../../notifications/notifications.constants';
import type { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { QueueRecalculationService } from './queue-recalculation.service';

export interface CompactedQueueItem {
  appointmentId: string;
  ticketId: string | null;
  queueNumber: number;
  scheduledStartTime: string;
  patientId: string;
}

export interface QueueRecalculationResult {
  serviceDate: string;
  practitionerId: string | null;
  totalActive: number;
  updatedCount: number;
  compactedQueue: CompactedQueueItem[];
}

@Injectable()
export class QueuePositionRecalculationService {
  private readonly logger = new Logger(QueuePositionRecalculationService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional()
    private readonly redisService?: RedisService,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    private readonly queueRecalcEstimator?: QueueRecalculationService,
  ) {}

  /**
   * Recalculates and compacts the active queue positions for a specific doctor
   * on a specific service date. Assigns clean sequential positions (1..N) to
   * all active appointments (BOOKED, WAITING, IN_SERVICE) in deterministic FIFO order.
   */
  async recalculateDoctorQueue(params: {
    serviceDate: string;
    practitionerId: string | null;
  }): Promise<QueueRecalculationResult> {
    const { serviceDate, practitionerId } = params;

    this.logger.log(
      `Recalculating queue positions [date=${serviceDate}, doctor=${practitionerId || 'unassigned'}]`,
    );

    const doctorCondition = practitionerId
      ? eq(appointments.practitionerId, practitionerId)
      : isNull(appointments.practitionerId);

    // 1. Fetch active appointments eligible for queue positioning
    const activeAppointments = await this.db
      .select({
        id: appointments.id,
        patientId: appointments.patientId,
        practitionerId: appointments.practitionerId,
        status: appointments.status,
        scheduledStartTime: appointments.scheduledStartTime,
        createdAt: appointments.createdAt,
        currentQueueNumber: appointments.queueNumber,
        ticketId: queueTickets.id,
        ticketWaitingPosition: queueTickets.waitingPosition,
        ticketStatus: queueTickets.status,
        ticketQueueNumber: queueTickets.queueNumber,
        ticketAssignedAt: queueTickets.assignedAt,
      })
      .from(appointments)
      .leftJoin(
        queueTickets,
        and(
          eq(queueTickets.appointmentId, appointments.id),
          sql`${queueTickets.status} NOT IN (${QUEUE_TICKET_STATUS.CANCELLED}, ${QUEUE_TICKET_STATUS.COMPLETED})`,
        ),
      )
      .where(
        and(
          eq(appointments.scheduledDate, serviceDate),
          doctorCondition,
          inArray(appointments.status, [
            DB_APPOINTMENT_STATUS.BOOKED,
            DB_APPOINTMENT_STATUS.WAITING,
            DB_APPOINTMENT_STATUS.IN_SERVICE,
          ]),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${appointments.status} = ${DB_APPOINTMENT_STATUS.IN_SERVICE} THEN 0 ELSE 1 END`,
        asc(
          sql`COALESCE(${queueTickets.assignedAt}, ${queueTickets.createdAt}, ${appointments.createdAt})`,
        ),
        asc(appointments.scheduledStartTime),
        asc(appointments.createdAt),
        asc(appointments.id),
      );

    // 2. Compute compacted 1..N assignments
    const compactedQueue: CompactedQueueItem[] = [];
    const appointmentUpdates: Array<{ id: string; queueNumber: number }> = [];
    const ticketUpdates: Array<{
      id: string;
      waitingPosition: number;
      queueNumber?: string;
    }> = [];

    let position = 1;
    for (const apt of activeAppointments) {
      let nextFormattedTicketNumber: string | undefined;

      if (apt.ticketId && apt.ticketQueueNumber) {
        const cleanNumber = apt.ticketQueueNumber
          .replace(/^TMP_[^_]+_/, '')
          .replace(/^TMP_/, '');
        const match = cleanNumber.match(/^(.*?)([0-9]+)$/);
        const prefix = match ? match[1] : 'Q-';
        nextFormattedTicketNumber = `${prefix}${String(position).padStart(3, '0')}`;
      }

      compactedQueue.push({
        appointmentId: apt.id,
        ticketId: apt.ticketId || null,
        queueNumber: position,
        scheduledStartTime: apt.scheduledStartTime,
        patientId: apt.patientId,
      });

      if (apt.currentQueueNumber !== position) {
        appointmentUpdates.push({
          id: apt.id,
          queueNumber: position,
        });
      }

      if (
        apt.ticketId &&
        (apt.ticketWaitingPosition !== position ||
          (nextFormattedTicketNumber &&
            apt.ticketQueueNumber !== nextFormattedTicketNumber))
      ) {
        ticketUpdates.push({
          id: apt.ticketId,
          waitingPosition: position,
          queueNumber: nextFormattedTicketNumber,
        });
      }

      position++;
    }

    // 3. Clear waiting_position for terminal/non-active tickets under this doctor partition
    const terminalTickets = await this.db
      .select({
        ticketId: queueTickets.id,
      })
      .from(queueTickets)
      .innerJoin(appointments, eq(appointments.id, queueTickets.appointmentId))
      .where(
        and(
          eq(appointments.scheduledDate, serviceDate),
          doctorCondition,
          sql`${appointments.status} NOT IN (${DB_APPOINTMENT_STATUS.BOOKED}, ${DB_APPOINTMENT_STATUS.WAITING}, ${DB_APPOINTMENT_STATUS.IN_SERVICE})`,
          sql`${queueTickets.waitingPosition} IS NOT NULL`,
        ),
      );

    // 4. Perform atomic batch update
    let updatedCount = appointmentUpdates.length + ticketUpdates.length;

    await this.db.transaction(async (tx) => {
      for (const update of appointmentUpdates) {
        await tx
          .update(appointments)
          .set({
            queueNumber: update.queueNumber,
            updatedAt: sql`NOW()`,
          })
          .where(eq(appointments.id, update.id));
      }

      // Two-phase update to prevent transient unique constraint collisions on queue_number
      const ticketsWithNumberChange = ticketUpdates.filter(
        (u) => u.queueNumber !== undefined,
      );

      // Phase 1: Temporary prefix
      for (const update of ticketsWithNumberChange) {
        await tx
          .update(queueTickets)
          .set({
            queueNumber: sql`'TMP_' || ${update.id}`,
            updatedAt: sql`NOW()`,
          })
          .where(eq(queueTickets.id, update.id));
      }

      // Phase 2: Final ticket values
      for (const update of ticketUpdates) {
        await tx
          .update(queueTickets)
          .set({
            waitingPosition: update.waitingPosition,
            ...(update.queueNumber ? { queueNumber: update.queueNumber } : {}),
            updatedAt: sql`NOW()`,
          })
          .where(eq(queueTickets.id, update.id));
      }

      for (const term of terminalTickets) {
        await tx
          .update(queueTickets)
          .set({
            waitingPosition: null,
            updatedAt: sql`NOW()`,
          })
          .where(eq(queueTickets.id, term.ticketId));
        updatedCount++;
      }
    });

    this.logger.log(
      `Queue recalculation finished [date=${serviceDate}, doctor=${practitionerId || 'unassigned'}]: ${compactedQueue.length} active, ${updatedCount} DB rows modified`,
    );

    // 5. Invalidate Redis Caches
    if (this.redisService) {
      await Promise.allSettled([
        this.redisService.deleteByPrefix('queue:'),
        this.redisService.deleteByPrefix('appointments:'),
        this.redisService.invalidateTags(
          'queue',
          'daily',
          'display',
          'schedule',
          'schedule:list',
          'schedule:detail',
          'schedule:patients',
          'appointments',
          'appointments:me',
        ),
      ]);
    }

    // 6. Broadcast Real-time Events via Socket.IO
    if (this.realtimeGateway?.server) {
      try {
        this.realtimeGateway.server.emit('queue:estimates:updated', {
          serviceDate,
          practitionerId,
          activeCount: compactedQueue.length,
          updatedCount,
          timestamp: new Date().toISOString(),
        });

        for (const item of compactedQueue) {
          this.realtimeGateway.server.emit('appointment:status_changed', {
            appointmentId: item.appointmentId,
            queueNumber: item.queueNumber,
            practitionerId,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Failed to broadcast realtime queue updates: ${err.message}`);
      }
    }

    // 7. Optionally trigger sliding time window simulation
    if (this.queueRecalcEstimator) {
      this.queueRecalcEstimator
        .recalculateSession({
          serviceDate,
          triggerEvent: 'queue_compaction',
        })
        .catch((err) => {
          this.logger.warn(
            `Secondary queue estimation recalculation notice: ${err.message}`,
          );
        });
    }

    return {
      serviceDate,
      practitionerId,
      totalActive: compactedQueue.length,
      updatedCount,
      compactedQueue,
    };
  }

  /**
   * Recalculates the queue partition(s) associated with an appointment ID.
   */
  async recalculateForAppointment(
    appointmentId: string,
  ): Promise<QueueRecalculationResult[]> {
    const [apt] = await this.db
      .select({
        scheduledDate: appointments.scheduledDate,
        practitionerId: appointments.practitionerId,
      })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);

    if (!apt) {
      return [];
    }

    const result = await this.recalculateDoctorQueue({
      serviceDate: apt.scheduledDate,
      practitionerId: apt.practitionerId,
    });

    return [result];
  }

  /**
   * Recalculates multiple unique partitions (e.g. for moves or mass operations).
   */
  async recalculatePartitions(
    partitions: Array<{ serviceDate: string; practitionerId: string | null }>,
  ): Promise<QueueRecalculationResult[]> {
    const seen = new Set<string>();
    const uniquePartitions: Array<{ serviceDate: string; practitionerId: string | null }> = [];

    for (const p of partitions) {
      const key = `${p.serviceDate}__${p.practitionerId || 'unassigned'}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePartitions.push(p);
      }
    }

    const results: QueueRecalculationResult[] = [];
    for (const partition of uniquePartitions) {
      const res = await this.recalculateDoctorQueue(partition);
      results.push(res);
    }

    return results;
  }
}

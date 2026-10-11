import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { Temporal } from '@js-temporal/polyfill';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  patientProfiles,
  queueTickets,
  sessionDefs,
  sessionSchedules,
} from '../../../../database/schema';
import { QUEUE_ENGINE_REPOSITORY } from '../../domain/constants/queue-engine.constants';
import type { IQueueEngineRepository } from '../../domain/repositories/queue-engine.repository';
import {
  SimulatorService,
  type SimulationTicketItem,
} from '../../domain/services/simulator.service';
import { EstimatorService } from '../../domain/services/estimator.service';
import { ClinicSettingService } from '../../infrastructure/config/clinic-setting.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { REALTIME_GATEWAY_PORT } from '../../../notifications/notifications.constants';
import type { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import type { TimeInterval } from '../../domain/types/calendar.types';

export interface RecalculationParams {
  serviceDate: string;
  sessionId?: string;
  categoryId?: string;
  triggerEvent?: string;
  ticketId?: string;
  appointmentId?: string;
}

@Injectable()
export class QueueRecalculationService {
  private readonly logger = new Logger(QueueRecalculationService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Inject(QUEUE_ENGINE_REPOSITORY)
    private readonly queueRepo: IQueueEngineRepository,
    private readonly simulator: SimulatorService,
    private readonly estimator: EstimatorService,
    private readonly clinicSettings: ClinicSettingService,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
  ) {}

  /**
   * Recalculates queue estimations dynamically when lifecycle events occur.
   * Slides projected start/end times and notifies waiting patients if ETA shifts significantly.
   */
  async recalculateSession(params: RecalculationParams): Promise<{
    processed: boolean;
    updatedCount: number;
    sessionsHandled: number;
  }> {
    const { serviceDate, triggerEvent } = params;
    let { sessionId, categoryId } = params;

    this.logger.log(
      `Queue recalculation triggered [date=${serviceDate}, session=${sessionId || 'all'}, category=${categoryId || 'all'}, event=${triggerEvent || 'progression'}]`,
    );

    // If sessionId or categoryId not explicitly supplied, discover them from ticket/appointment or active tickets on serviceDate
    const sessionTargets: Array<{ sessionId: string; categoryId?: string }> = [];

    if (sessionId) {
      sessionTargets.push({ sessionId, categoryId });
    } else if (params.ticketId) {
      const ticket = await this.queueRepo.getTicketById(params.ticketId);
      if (ticket?.sessionId) {
        sessionTargets.push({
          sessionId: ticket.sessionId,
          categoryId: ticket.categoryId,
        });
      }
    } else if (params.appointmentId) {
      const [apt] = await this.db
        .select({
          categoryId: queueTickets.categoryId,
          sessionId: queueTickets.sessionId,
        })
        .from(queueTickets)
        .where(eq(queueTickets.appointmentId, params.appointmentId))
        .limit(1);

      if (apt?.sessionId) {
        sessionTargets.push({
          sessionId: apt.sessionId,
          categoryId: apt.categoryId || undefined,
        });
      }
    }

    if (sessionTargets.length === 0) {
      // Find all distinct active sessions for this service date
      const activeRows = await this.db
        .select({
          sessionId: queueTickets.sessionId,
          categoryId: queueTickets.categoryId,
        })
        .from(queueTickets)
        .where(
          and(
            eq(queueTickets.queueDate, serviceDate),
            sql`${queueTickets.status} IN ('waiting', 'called', 'in_service')`,
          ),
        );

      const seen = new Set<string>();
      for (const row of activeRows) {
        if (!row.sessionId) continue;
        const key = `${row.sessionId}_${row.categoryId || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          sessionTargets.push({
            sessionId: row.sessionId,
            categoryId: row.categoryId || undefined,
          });
        }
      }
    }

    if (sessionTargets.length === 0) {
      this.logger.debug(
        `No active sessions found for recalculation on date ${serviceDate}`,
      );
      return { processed: true, updatedCount: 0, sessionsHandled: 0 };
    }

    let totalUpdated = 0;

    for (const target of sessionTargets) {
      const count = await this.recalculateSingleSession(
        serviceDate,
        target.sessionId,
        target.categoryId,
      );
      totalUpdated += count;
    }

    return {
      processed: true,
      updatedCount: totalUpdated,
      sessionsHandled: sessionTargets.length,
    };
  }

  private async recalculateSingleSession(
    serviceDate: string,
    sessionId: string,
    categoryId?: string,
  ): Promise<number> {
    // 1. Fetch active tickets in waiting, called, or in_service status
    const activeTickets = await this.queueRepo.findActiveTicketsBySession({
      serviceDate,
      sessionId,
      categoryId,
    });

    if (activeTickets.length === 0) {
      return 0;
    }

    // 2. Load clinic configuration tunables
    const priorMinutes =
      (await this.clinicSettings
        .getNumber('duration.prior_minutes')
        .catch(() => 30)) || 30;
    const priorWeight =
      (await this.clinicSettings
        .getNumber('duration.prior_weight')
        .catch(() => 5)) || 5;
    const minRemainingMinutes =
      (await this.clinicSettings
        .getNumber('duration.min_remaining_minutes')
        .catch(() => 5)) || 5;
    const updateThresholdMinutes =
      (await this.clinicSettings
        .getNumber('eta.update_threshold_minutes')
        .catch(() => 10)) || 10;
    const notifyDelayMinutes =
      (await this.clinicSettings
        .getNumber('eta.notify_delay_minutes')
        .catch(() => 15)) || 15;
    const displayRoundMinutes =
      (await this.clinicSettings
        .getNumber('eta.display_round_minutes')
        .catch(() => 5)) || 5;
    const timezone =
      this.clinicTimeService?.getTimezone() ||
      (await this.clinicSettings
        .getString('clinic.timezone')
        .catch(() => 'Asia/Jakarta')) ||
      'Asia/Jakarta';

    // 3. Compute estimated duration using empirical completed durations + Bayesian prior
    const recentDurations =
      await this.queueRepo.getRecentCompletedDurations({
        categoryId,
        limit: 20,
      });

    const estimatedDurationMinutes = this.estimator.estimateDuration({
      durationsMinutes: recentDurations,
      priorMinutes,
      priorWeight,
    });

    // 4. Resolve lane capacity and session operational window
    const lanes = await this.queueRepo.getActiveLanesCount({
      serviceDate,
      sessionId,
      categoryId,
    });

    const sessionWindow = await this.resolveSessionWindow(
      serviceDate,
      sessionId,
      timezone,
    );

    const effectiveSegments: TimeInterval[] = [
      {
        start: sessionWindow.start,
        end: sessionWindow.end,
      },
    ];

    // 5. Run simulation with sliding window
    const now = this.clinicTimeService?.nowDate() || new Date();
    const simTickets: SimulationTicketItem[] = activeTickets.map((t) => ({
      id: t.id,
      status: t.status,
      actualStart: t.startedAt || t.calledAt,
    }));

    const simResult = this.simulator.simulateQueue({
      lanes,
      effectiveSegments,
      tickets: simTickets,
      estimatedDurationMinutes,
      currentTime: now,
      minRemainingMinutes,
    });

    // 6. Identify tickets that shifted significantly
    const batchUpdates: Array<{
      ticketId: string;
      projectedStart: Date;
      projectedEnd: Date;
      waitingPosition: number;
    }> = [];

    const shiftedForNotification: Array<{
      ticketId: string;
      oldStart: Date | null;
      newStart: Date;
      newEnd: Date;
      shiftMinutes: number;
      queueNumber: string;
      patientId?: string;
    }> = [];

    for (const ticket of activeTickets) {
      const proj = simResult.projections.get(ticket.id);
      if (!proj) continue;

      const oldStart = ticket.projectedStart;
      const newStart = proj.projectedStart;
      const newEnd = proj.projectedEnd;

      let hasShifted = false;
      let shiftMinutes = 0;

      if (!oldStart) {
        hasShifted = true;
      } else {
        shiftMinutes = Math.abs(newStart.getTime() - oldStart.getTime()) / 60_000;
        if (shiftMinutes >= updateThresholdMinutes) {
          hasShifted = true;
        }
      }

      const positionChanged = ticket.waitingPosition !== proj.position;

      if (hasShifted || positionChanged) {
        batchUpdates.push({
          ticketId: ticket.id,
          projectedStart: newStart,
          projectedEnd: newEnd,
          waitingPosition: proj.position,
        });

        if (shiftMinutes >= notifyDelayMinutes) {
          shiftedForNotification.push({
            ticketId: ticket.id,
            oldStart: oldStart ?? null,
            newStart,
            newEnd,
            shiftMinutes,
            queueNumber: ticket.queueNumber,
            patientId: ticket.patientId,
          });
        }
      }
    }

    if (batchUpdates.length > 0) {
      // 7. Atomic batch update
      await this.queueRepo.batchUpdateProjections(batchUpdates);
      this.logger.log(
        `Recalculated projections for session ${sessionId}: updated ${batchUpdates.length} tickets (shifts >= ${updateThresholdMinutes}m)`,
      );

      // 8. Send notification to patients whose estimated start time shifted >= notifyDelayMinutes
      if (this.notificationGateway && shiftedForNotification.length > 0) {
        await this.dispatchShiftNotifications(
          shiftedForNotification,
          timezone,
          displayRoundMinutes,
        );
      }

      // 9. Realtime broadcast via Socket.IO
      if (this.realtimeGateway?.server) {
        try {
          this.realtimeGateway.server.emit('queue:estimates:updated', {
            serviceDate,
            sessionId,
            categoryId,
            updatedTicketsCount: batchUpdates.length,
            timestamp: now.toISOString(),
          });
        } catch (err) {
          this.logger.warn(`Failed to broadcast queue:estimates:updated: ${err}`);
        }
      }
    }

    return batchUpdates.length;
  }

  private async resolveSessionWindow(
    serviceDate: string,
    sessionId: string,
    timezone: string,
  ): Promise<{ start: Date; end: Date }> {
    const dow = new Date(`${serviceDate}T00:00:00.000Z`).getUTCDay();

    // Query session_schedule first for day-of-week override
    const [scheduleRow] = await this.db
      .select({
        startsAt: sessionSchedules.startsAt,
        endsAt: sessionSchedules.endsAt,
      })
      .from(sessionSchedules)
      .where(
        and(
          eq(sessionSchedules.sessionId, sessionId),
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
        ),
      )
      .limit(1);

    let startTime = scheduleRow?.startsAt;
    let endTime = scheduleRow?.endsAt;

    if (!startTime || !endTime) {
      const [defRow] = await this.db
        .select({
          startsAt: sessionDefs.defaultStartsAt,
          endsAt: sessionDefs.defaultEndsAt,
        })
        .from(sessionDefs)
        .where(eq(sessionDefs.id, sessionId))
        .limit(1);

      startTime = defRow?.startsAt || '08:00';
      endTime = defRow?.endsAt || '12:00';
    }

    // Parse start and end times in clinic timezone
    const startIso = `${startTime.length === 5 ? startTime + ':00' : startTime}`;
    const endIso = `${endTime.length === 5 ? endTime + ':00' : endTime}`;

    const startDate = new Date(
      Temporal.PlainDateTime.from(`${serviceDate}T${startIso}`)
        .toZonedDateTime(timezone)
        .toInstant().epochMilliseconds,
    );

    const endDate = new Date(
      Temporal.PlainDateTime.from(`${serviceDate}T${endIso}`)
        .toZonedDateTime(timezone)
        .toInstant().epochMilliseconds,
    );

    return { start: startDate, end: endDate };
  }

  private async dispatchShiftNotifications(
    shiftedItems: Array<{
      ticketId: string;
      oldStart: Date | null;
      newStart: Date;
      newEnd: Date;
      shiftMinutes: number;
      queueNumber: string;
      patientId?: string;
    }>,
    timezone: string,
    displayRoundMinutes: number,
  ): Promise<void> {
    if (!this.notificationGateway) return;

    // Resolve user IDs for recipient patients
    const patientIds = shiftedItems
      .map((s) => s.patientId)
      .filter((id): id is string => Boolean(id));

    const userMap = new Map<string, string>();
    if (patientIds.length > 0) {
      const rows = await this.db
        .select({
          patientId: patientProfiles.id,
          userId: patientProfiles.userId,
        })
        .from(patientProfiles)
        .where(inArray(patientProfiles.id, patientIds));

      for (const r of rows) {
        if (r.userId) {
          userMap.set(r.patientId, r.userId);
        }
      }
    }

    for (const item of shiftedItems) {
      const userId = item.patientId ? userMap.get(item.patientId) : undefined;
      if (!userId) continue;

      const durationMinutes = Math.round(
        (item.newEnd.getTime() - item.newStart.getTime()) / 60_000,
      );
      const etaWindow = this.estimator.formatEtaWindow(
        item.newStart,
        durationMinutes,
        displayRoundMinutes,
        timezone,
      );

      const isEarlier =
        item.oldStart && item.newStart.getTime() < item.oldStart.getTime();
      const directionText = isEarlier ? 'lebih awal' : 'sedikit mundur';

      await this.notificationGateway
        .dispatch({
          commandId: `recalc-shift-${item.ticketId}-${Date.now()}`,
          sourceDomain: 'queue',
          target: {
            type: 'user',
            recipientUserIds: [userId],
          },
          category: 'queue',
          content: {
            title: 'Pembaruan Estimasi Antrean',
            body: `Pelayanan klinik berjalan dinamis. Estimasi giliran antrean ${item.queueNumber} bergeser ${directionText} menjadi ${etaWindow.displayRange}.`,
            data: {
              ticketId: item.ticketId,
              queueNumber: item.queueNumber,
              estimatedStart: etaWindow.start.toISOString(),
              estimatedEnd: etaWindow.end.toISOString(),
              shiftMinutes: Math.round(item.shiftMinutes),
            },
          },
          channels: ['in_app', 'push'],
          priority: 'high',
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to dispatch shift notification for ticket ${item.ticketId}: ${err.message}`,
          );
        });
    }
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import {
  appointments,
  doctorAssignments,
  queueCounters,
  queueTickets,
  serviceCategories,
  sessionDefs,
} from '../../../../database/schema';
import { IQueueEngineRepository } from '../../domain/repositories/queue-engine.repository';
import { QueueEngineService } from '../../domain/services/queue-engine.service';
import {
  QUEUE_TICKET_SOURCE,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/queue-engine.constants';
import { DomainQueueTicket, QueueTicketStatus } from '../../domain/types/queue.types';

@Injectable()
export class DrizzleQueueEngineRepository implements IQueueEngineRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE) private readonly db: any,
    private readonly queueEngine: QueueEngineService,
  ) {}

  async atomicGetNextQueueNumber(params: {
    serviceDate: string;
    categoryId: string;
    sessionId: string;
    codePrefix: string;
  }): Promise<{ seq: number; formatted: string }> {
    const { serviceDate, categoryId, sessionId, codePrefix } = params;

    const res = await this.db.execute(sql`
      INSERT INTO queue_counter (service_date, category_id, session_id, last_no)
      VALUES (${serviceDate}, ${categoryId}::uuid, ${sessionId}::uuid, 1)
      ON CONFLICT (service_date, category_id, session_id)
      DO UPDATE SET last_no = queue_counter.last_no + 1
      RETURNING last_no;
    `);

    const lastNo = Number(res.rows[0]?.last_no ?? 1);
    const formatted = this.queueEngine.formatTicketNumber(codePrefix, lastNo);

    return { seq: lastNo, formatted };
  }

  async callNextTicket(params: {
    roomId: string;
    doctorId: string;
    categoryId?: string;
    serviceDate: string;
  }): Promise<DomainQueueTicket | null> {
    const { roomId, doctorId, categoryId, serviceDate } = params;

    const res = await this.db.execute(sql`
      SELECT id, appointment_id, category_id, session_id, queue_date, queue_number, patient_id, status
      FROM queue_tickets
      WHERE queue_date = ${serviceDate}
        AND (${categoryId ?? null}::uuid IS NULL OR category_id = ${categoryId ?? null}::uuid)
        AND status = 'waiting'
      ORDER BY queue_number ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    `);

    if (!res.rows || res.rows.length === 0) {
      return null;
    }

    const target = res.rows[0];
    const nowIso = new Date().toISOString();

    const [updated] = await this.db
      .update(queueTickets)
      .set({
        status: QUEUE_TICKET_STATUS.CALLED,
        roomId,
        doctorId,
        calledAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(queueTickets.id, target.id))
      .returning();

    if (target.appointment_id) {
      await this.db
        .update(appointments)
        .set({
          status: 'called',
          practitionerId: doctorId,
          roomId: roomId,
          lastCalledAt: nowIso,
          updatedAt: nowIso,
        })
        .where(eq(appointments.id, target.appointment_id));
    }

    return this.mapToDomainTicket(updated);
  }

  async getRecentCompletedDurations(params: {
    categoryId?: string;
    limit?: number;
  }): Promise<number[]> {
    const { categoryId, limit = 20 } = params;

    const res = await this.db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (completed_at - started_at))/60 AS duration_min
      FROM queue_tickets
      WHERE status = 'completed'
        AND started_at IS NOT NULL
        AND completed_at IS NOT NULL
        AND (${categoryId ?? null}::uuid IS NULL OR category_id = ${categoryId ?? null}::uuid)
      ORDER BY completed_at DESC
      LIMIT ${limit};
    `);

    return (res.rows || [])
      .map((r: any) => Math.round(Number(r.duration_min)))
      .filter((n: number) => n > 0 && n <= 120);
  }

  async getActiveLanesCount(params: {
    serviceDate: string;
    sessionId: string;
    categoryId?: string;
  }): Promise<number> {
    const { serviceDate, sessionId, categoryId } = params;

    // In outpatient clinic operations, unassigned category queue streams
    // represent an isolated sequential pipeline (1 lane) to preserve 1..N FIFO queue slots
    // without start-time collision across waiting patients before doctor assignment.
    if (categoryId) {
      return 1;
    }

    const dow = new Date(`${serviceDate}T00:00:00.000Z`).getUTCDay();

    const rows = await this.db
      .select({ id: doctorAssignments.id })
      .from(doctorAssignments)
      .where(
        and(
          eq(doctorAssignments.sessionId, sessionId),
          eq(doctorAssignments.isActive, true),
          or(eq(doctorAssignments.dow, dow), isNull(doctorAssignments.dow)),
        ),
      );

    return Math.max(1, rows.length);
  }

  async getTicketById(ticketId: string): Promise<DomainQueueTicket | null> {
    const rows = await this.db
      .select()
      .from(queueTickets)
      .where(eq(queueTickets.id, ticketId))
      .limit(1);

    if (!rows.length) return null;
    return this.mapToDomainTicket(rows[0]);
  }

  async findActiveTicketsBySession(params: {
    serviceDate: string;
    sessionId: string;
    categoryId?: string;
  }): Promise<DomainQueueTicket[]> {
    const { serviceDate, sessionId, categoryId } = params;

    const conditions = [
      eq(queueTickets.queueDate, serviceDate),
      eq(queueTickets.sessionId, sessionId),
      or(
        eq(queueTickets.status, QUEUE_TICKET_STATUS.WAITING),
        eq(queueTickets.status, QUEUE_TICKET_STATUS.CALLED),
        eq(queueTickets.status, QUEUE_TICKET_STATUS.IN_SERVICE),
      ),
    ];

    if (categoryId) {
      conditions.push(eq(queueTickets.categoryId, categoryId));
    }

    const rows = await this.db
      .select()
      .from(queueTickets)
      .where(and(...conditions))
      .orderBy(queueTickets.queueNumber);

    return rows.map((r: any) => this.mapToDomainTicket(r));
  }

  async batchUpdateProjections(
    updates: Array<{
      ticketId: string;
      projectedStart: Date;
      projectedEnd: Date;
      waitingPosition: number;
    }>,
  ): Promise<void> {
    if (!updates || updates.length === 0) return;

    const nowIso = new Date().toISOString();

    await this.db.transaction(async (tx: any) => {
      for (const u of updates) {
        const [updatedTicket] = await tx
          .update(queueTickets)
          .set({
            projectedStart: u.projectedStart.toISOString(),
            projectedEnd: u.projectedEnd.toISOString(),
            waitingPosition: u.waitingPosition,
            updatedAt: nowIso,
          })
          .where(eq(queueTickets.id, u.ticketId))
          .returning({ appointmentId: queueTickets.appointmentId });

        if (updatedTicket?.appointmentId) {
          await tx
            .update(appointments)
            .set({
              estimatedStartAt: u.projectedStart.toISOString(),
              estimatedEndAt: u.projectedEnd.toISOString(),
              updatedAt: nowIso,
            })
            .where(eq(appointments.id, updatedTicket.appointmentId));
        }
      }
    });
  }

  private mapToDomainTicket(row: any): DomainQueueTicket {
    return {
      id: row.id,
      categoryId: row.categoryId,
      sessionId: row.sessionId,
      serviceDate: row.queueDate,
      queueNumber: row.queueNumber,
      patientId: row.patientId,
      roomId: row.roomId,
      doctorId: row.doctorId,
      status: row.status as QueueTicketStatus,
      waitingPosition: row.waitingPosition,
      projectedStart: row.projectedStart ? new Date(row.projectedStart) : null,
      projectedEnd: row.projectedEnd ? new Date(row.projectedEnd) : null,
      calledAt: row.calledAt ? new Date(row.calledAt) : null,
      startedAt: row.startedAt ? new Date(row.startedAt) : null,
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
      carriedOver: Boolean(row.carriedOver),
      movedTo: row.movedTo,
      source: row.source || QUEUE_TICKET_SOURCE.ONLINE,
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentCallAttempts,
  appointments,
  clinicRooms,
  clinicServices,
  patientAffiliations,
  patientProfiles,
  practitioners,
  queueTickets,
} from '../../../../database/schema';
import {
  DB_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import {
  AppointmentCallAttemptRecord,
  AppointmentCallDetails,
  AppointmentCallRepository,
} from '../../domain/repositories/appointment-call.repository';

@Injectable()
export class AppointmentCallDrizzleRepository
  implements AppointmentCallRepository
{
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async findAttemptsByAppointmentId(
    appointmentId: string,
  ): Promise<AppointmentCallAttemptRecord[]> {
    const records = await this.db
      .select()
      .from(appointmentCallAttempts)
      .where(eq(appointmentCallAttempts.appointmentId, appointmentId))
      .orderBy(desc(appointmentCallAttempts.attemptNumber));

    return records.map((r) => ({
      id: r.id,
      appointmentId: r.appointmentId,
      queueTicketId: r.queueTicketId,
      attemptNumber: r.attemptNumber,
      status: r.status,
      calledBy: r.calledBy,
      calledAt: r.calledAt,
      respondedAt: r.respondedAt,
      notes: r.notes,
      createdAt: r.createdAt,
    }));
  }

  async getLatestAttempt(
    appointmentId: string,
  ): Promise<AppointmentCallAttemptRecord | null> {
    const [record] = await this.db
      .select()
      .from(appointmentCallAttempts)
      .where(eq(appointmentCallAttempts.appointmentId, appointmentId))
      .orderBy(desc(appointmentCallAttempts.attemptNumber))
      .limit(1);

    if (!record) return null;

    return {
      id: record.id,
      appointmentId: record.appointmentId,
      queueTicketId: record.queueTicketId,
      attemptNumber: record.attemptNumber,
      status: record.status,
      calledBy: record.calledBy,
      calledAt: record.calledAt,
      respondedAt: record.respondedAt,
      notes: record.notes,
      createdAt: record.createdAt,
    };
  }

  async recordCallAttempt(data: {
    appointmentId: string;
    queueTicketId?: string | null;
    attemptNumber: number;
    status: string;
    calledBy?: string | null;
    notes?: string | null;
  }): Promise<AppointmentCallAttemptRecord> {
    const [record] = await this.db
      .insert(appointmentCallAttempts)
      .values({
        appointmentId: data.appointmentId,
        queueTicketId: data.queueTicketId ?? null,
        attemptNumber: data.attemptNumber,
        status: data.status,
        calledBy: data.calledBy ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    return {
      id: record.id,
      appointmentId: record.appointmentId,
      queueTicketId: record.queueTicketId,
      attemptNumber: record.attemptNumber,
      status: record.status,
      calledBy: record.calledBy,
      calledAt: record.calledAt,
      respondedAt: record.respondedAt,
      notes: record.notes,
      createdAt: record.createdAt,
    };
  }

  async updateAttemptStatus(
    attemptId: string,
    status: string,
    respondedAt?: string | null,
  ): Promise<void> {
    await this.db
      .update(appointmentCallAttempts)
      .set({
        status,
        respondedAt: respondedAt ?? null,
      })
      .where(eq(appointmentCallAttempts.id, attemptId));
  }

  async getAppointmentWithDetails(
    appointmentId: string,
  ): Promise<AppointmentCallDetails | null> {
    const [result] = await this.db
      .select({
        id: appointments.id,
        status: appointments.status,
        bookingCode: appointments.bookingCode,
        patientId: appointments.patientId,
        patientUserId: sql<string>`COALESCE(${patientProfiles.userId}, ${patientAffiliations.userId}, ${appointments.createdBy})`,
        patientName: patientProfiles.fullName,
        ticketId: queueTickets.id,
        ticketNumber: queueTickets.queueNumber,
        ticketStatus: queueTickets.status,
        poliklinikName: clinicServices.name,
        roomName: clinicRooms.name,
        doctorName: practitioners.displayName,
        practitionerId: appointments.practitionerId,
        categoryId: queueTickets.categoryId,
        scheduledDate: appointments.scheduledDate,
      })
      .from(appointments)
      .leftJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
      .leftJoin(
        patientAffiliations,
        eq(patientAffiliations.patientId, appointments.patientId),
      )
      .leftJoin(queueTickets, eq(queueTickets.appointmentId, appointments.id))
      .leftJoin(clinicServices, eq(clinicServices.id, appointments.serviceId))
      .leftJoin(clinicRooms, eq(clinicRooms.id, appointments.roomId))
      .leftJoin(practitioners, eq(practitioners.id, appointments.practitionerId))
      .where(eq(appointments.id, appointmentId));

    if (!result) return null;

    return result as AppointmentCallDetails;
  }

  async findEarlierWaitingTicket(
    ticketId: string,
  ): Promise<{ queueNumber: string; id: string } | null> {
    const [ticket] = await this.db
      .select({
        id: queueTickets.id,
        queueNumber: queueTickets.queueNumber,
        queueDate: queueTickets.queueDate,
        categoryId: queueTickets.categoryId,
        serviceId: queueTickets.serviceId,
      })
      .from(queueTickets)
      .where(eq(queueTickets.id, ticketId))
      .limit(1);

    if (!ticket) return null;

    const numStr = ticket.queueNumber.replace(/\D/g, '');
    const currentNum = parseInt(numStr, 10);

    const conditions = [
      eq(queueTickets.queueDate, ticket.queueDate),
      eq(queueTickets.status, QUEUE_TICKET_STATUS.WAITING),
      sql`${queueTickets.id} != ${ticket.id}`,
    ];

    if (ticket.categoryId) {
      conditions.push(eq(queueTickets.categoryId, ticket.categoryId));
    } else if (ticket.serviceId) {
      conditions.push(eq(queueTickets.serviceId, ticket.serviceId));
    }

    if (!isNaN(currentNum)) {
      conditions.push(
        sql`CAST(NULLIF(regexp_replace(${queueTickets.queueNumber}, '\\D', '', 'g'), '') AS integer) < ${currentNum}`,
      );
    }

    const [earlier] = await this.db
      .select({
        id: queueTickets.id,
        queueNumber: queueTickets.queueNumber,
      })
      .from(queueTickets)
      .where(and(...conditions))
      .orderBy(
        sql`CAST(NULLIF(regexp_replace(${queueTickets.queueNumber}, '\\D', '', 'g'), '') AS integer) ASC`,
        asc(queueTickets.createdAt),
      )
      .limit(1);

    return earlier ?? null;
  }

  async requeueTicket(ticketId: string, bumpPositions: number): Promise<void> {
    await this.db
      .update(queueTickets)
      .set({
        status: QUEUE_TICKET_STATUS.WAITING,
        waitingPosition: sql`coalesce(${queueTickets.waitingPosition}, 0) + ${bumpPositions}`,
        calledAt: null,
      })
      .where(eq(queueTickets.id, ticketId));
  }

  async updateAppointmentAndTicketStatus(
    appointmentId: string,
    appointmentStatus: string,
    ticketId?: string | null,
    ticketStatus?: string | null,
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    const updateApt: Record<string, any> = {
      status: appointmentStatus as any,
      updatedAt: nowIso,
    };

    if (appointmentStatus === DB_APPOINTMENT_STATUS.IN_SERVICE) {
      updateApt.startedAt = nowIso;
      updateApt.actualStartedAt = nowIso;
    } else if (appointmentStatus === DB_APPOINTMENT_STATUS.COMPLETED) {
      updateApt.completedAt = nowIso;
      updateApt.actualCompletedAt = nowIso;
    }

    if (ticketStatus === QUEUE_TICKET_STATUS.CALLED) {
      updateApt.lastCalledAt = nowIso;
    }

    await this.db
      .update(appointments)
      .set(updateApt)
      .where(eq(appointments.id, appointmentId));

    if (ticketId && ticketStatus) {
      const updateTicket: Record<string, any> = {
        status: ticketStatus as any,
        updatedAt: nowIso,
      };

      if (ticketStatus === QUEUE_TICKET_STATUS.CALLED) {
        updateTicket.calledAt = nowIso;
      } else if (ticketStatus === QUEUE_TICKET_STATUS.IN_SERVICE) {
        updateTicket.startedAt = nowIso;
      } else if (ticketStatus === QUEUE_TICKET_STATUS.COMPLETED) {
        updateTicket.completedAt = nowIso;
      }

      await this.db
        .update(queueTickets)
        .set(updateTicket)
        .where(eq(queueTickets.id, ticketId));
    }
  }
}

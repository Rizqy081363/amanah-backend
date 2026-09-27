import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointmentCallAttempts,
  appointments,
  clinicServices,
  patientProfiles,
  queueTickets,
} from '../../../../database/schema';
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
        patientUserId: patientProfiles.userId,
        patientName: patientProfiles.fullName,
        ticketId: queueTickets.id,
        ticketNumber: queueTickets.queueNumber,
        ticketStatus: queueTickets.status,
        poliklinikName: clinicServices.name,
      })
      .from(appointments)
      .leftJoin(
        patientProfiles,
        eq(patientProfiles.id, appointments.patientId),
      )
      .leftJoin(
        queueTickets,
        eq(queueTickets.appointmentId, appointments.id),
      )
      .leftJoin(
        clinicServices,
        eq(clinicServices.id, appointments.serviceId),
      )
      .where(eq(appointments.id, appointmentId));

    if (!result) return null;

    return result as AppointmentCallDetails;
  }

  async requeueTicket(
    ticketId: string,
    bumpPositions: number,
  ): Promise<void> {
    await this.db
      .update(queueTickets)
      .set({
        status: 'waiting',
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
    await this.db
      .update(appointments)
      .set({
        status: appointmentStatus as any,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(appointments.id, appointmentId));

    if (ticketId && ticketStatus) {
      await this.db
        .update(queueTickets)
        .set({
          status: ticketStatus as any,
        })
        .where(eq(queueTickets.id, ticketId));
    }
  }
}

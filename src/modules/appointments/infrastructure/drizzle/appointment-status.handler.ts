import { BadRequestException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  ConcurrentModificationConflictException,
  generateEntityVersion,
  matchesVersion,
  PreconditionFailedException,
} from '../../../../common/occ';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  practitioners,
  queueTickets,
} from '../../../../database/schema';
import {
  DB_APPOINTMENT_STATUS,
  DOMAIN_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';

export class AppointmentStatusHandler {
  static async updateStatus(
    db: DrizzleDatabase,
    id: string,
    status: AppointmentEntity['status'],
    staffId?: string,
    cancellationReason?: string,
    expectedVersion?: string,
    findById?: (id: string) => Promise<AppointmentEntity | null>,
  ): Promise<AppointmentEntity | null> {
    const existing = await db.query.appointments.findFirst({
      where: eq(appointments.id, id),
    });
    if (!existing) return null;

    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== ''
    ) {
      const currentVersion = generateEntityVersion(existing.updatedAt);
      if (
        !matchesVersion(expectedVersion, currentVersion, existing.updatedAt)
      ) {
        throw new PreconditionFailedException(
          currentVersion,
          expectedVersion,
          `Precondition failed: Appointment with ID ${id} has been modified since version "${expectedVersion}". Current version is "${currentVersion}".`,
        );
      }
    }

    let dbStatus: typeof appointments.$inferSelect.status =
      DB_APPOINTMENT_STATUS.BOOKED;
    let ticketStatus: typeof queueTickets.$inferSelect.status =
      QUEUE_TICKET_STATUS.WAITING;
    const nowStr = new Date().toISOString();

    const updateApt: Record<string, any> = {
      updatedAt: nowStr,
    };
    const updateTicket: Record<string, any> = {
      updatedAt: nowStr,
    };

    if (status === DOMAIN_APPOINTMENT_STATUS.WAITING) {
      if (!existing.practitionerId) {
        throw new BadRequestException(
          'Dokter penanggung jawab harus ditugaskan terlebih dahulu sebelum check-in.',
        );
      }
      if (!existing.roomId) {
        throw new BadRequestException(
          'Ruangan periksa harus ditugaskan terlebih dahulu sebelum check-in.',
        );
      }
      if (
        existing.status === DB_APPOINTMENT_STATUS.IN_SERVICE ||
        existing.status === DB_APPOINTMENT_STATUS.COMPLETED
      ) {
        throw new BadRequestException(
          `Janji temu yang sedang diperiksa atau telah selesai tidak dapat dikembalikan ke antrean menunggu.`,
        );
      }
      dbStatus = DB_APPOINTMENT_STATUS.WAITING;
      ticketStatus = QUEUE_TICKET_STATUS.WAITING;
      updateApt.status = dbStatus;
      updateApt.checkedInAt = existing.checkedInAt || nowStr;
      updateTicket.status = ticketStatus;
      updateTicket.checkedInAt = existing.checkedInAt || nowStr;
    } else if (status === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE) {
      const effectivePractitionerId = staffId || existing.practitionerId;
      if (!effectivePractitionerId) {
        throw new BadRequestException(
          'Dokter penanggung jawab belum ditugaskan untuk janji temu ini.',
        );
      }
      if (!existing.roomId) {
        throw new BadRequestException(
          'Ruangan periksa belum ditugaskan untuk janji temu ini.',
        );
      }
      if (
        existing.status === DB_APPOINTMENT_STATUS.BOOKED ||
        !existing.checkedInAt
      ) {
        throw new BadRequestException(
          'Pasien belum melakukan check-in kedatangan di klinik.',
        );
      }
      if (
        existing.status !== DB_APPOINTMENT_STATUS.WAITING &&
        existing.status !== DB_APPOINTMENT_STATUS.CHECKED_IN
      ) {
        throw new BadRequestException(
          `Janji temu dengan status '${existing.status}' tidak dapat diubah menjadi sedang diperiksa (in_service).`,
        );
      }
      dbStatus = DB_APPOINTMENT_STATUS.IN_SERVICE;
      ticketStatus = QUEUE_TICKET_STATUS.IN_SERVICE;
      updateApt.status = dbStatus;
      updateApt.startedAt = nowStr;
      updateApt.actualStartedAt = nowStr;
      if (staffId) {
        const prac = await db.query.practitioners.findFirst({
          where: eq(practitioners.id, staffId),
        });
        updateApt.practitionerId = prac ? prac.id : staffId;
      }
      updateTicket.status = ticketStatus;
      updateTicket.startedAt = nowStr;
      updateTicket.actualStart = nowStr;
    } else if (status === DOMAIN_APPOINTMENT_STATUS.COMPLETED) {
      if (existing.status !== DB_APPOINTMENT_STATUS.IN_SERVICE) {
        throw new BadRequestException(
          'Janji temu hanya dapat diselesaikan jika pasien sedang dalam pemeriksaan dokter (in_service).',
        );
      }
      dbStatus = DB_APPOINTMENT_STATUS.COMPLETED;
      ticketStatus = QUEUE_TICKET_STATUS.COMPLETED;
      updateApt.status = dbStatus;
      updateApt.completedAt = nowStr;
      updateApt.actualCompletedAt = nowStr;
      updateTicket.status = ticketStatus;
      updateTicket.completedAt = nowStr;
      updateTicket.actualEnd = nowStr;
    } else if (status === DOMAIN_APPOINTMENT_STATUS.CANCELLED) {
      if (existing.status === DB_APPOINTMENT_STATUS.IN_SERVICE) {
        throw new BadRequestException(
          'Janji temu tidak dapat dibatalkan karena pasien sedang dalam pemeriksaan dokter.',
        );
      }
      dbStatus = DB_APPOINTMENT_STATUS.CANCELLED;
      ticketStatus = QUEUE_TICKET_STATUS.CANCELLED;
      updateApt.status = dbStatus;
      updateApt.cancelledAt = nowStr;
      if (cancellationReason) {
        updateApt.cancelReason = cancellationReason;
      }
      updateTicket.status = ticketStatus;
    }

    const whereConditions = [eq(appointments.id, id)];
    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== ''
    ) {
      whereConditions.push(eq(appointments.updatedAt, existing.updatedAt));
    }

    const [updatedApt] = await db
      .update(appointments)
      .set(updateApt)
      .where(and(...whereConditions))
      .returning();

    if (!updatedApt) {
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        expectedVersion !== ''
      ) {
        const latest = await db.query.appointments.findFirst({
          where: eq(appointments.id, id),
        });
        if (latest) {
          const latestVersion = generateEntityVersion(latest.updatedAt);
          throw new ConcurrentModificationConflictException(
            latestVersion,
            `Concurrent modification detected: Appointment with ID ${id} was modified by another transaction. Current version is "${latestVersion}".`,
          );
        }
      }
      return null;
    }

    await db
      .update(queueTickets)
      .set(updateTicket)
      .where(eq(queueTickets.appointmentId, id))
      .returning();

    return findById ? findById(id) : null;
  }
}

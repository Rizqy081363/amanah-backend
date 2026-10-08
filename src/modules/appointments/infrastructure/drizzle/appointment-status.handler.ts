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
  practitionerScheduleSessions,
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
      dbStatus = DB_APPOINTMENT_STATUS.WAITING;
      ticketStatus = QUEUE_TICKET_STATUS.WAITING;
      updateApt.status = dbStatus;
      updateApt.checkedInAt = nowStr;
      updateTicket.status = ticketStatus;
      updateTicket.checkedInAt = nowStr;
    } else if (status === DOMAIN_APPOINTMENT_STATUS.IN_SERVICE) {
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
      dbStatus = DB_APPOINTMENT_STATUS.COMPLETED;
      ticketStatus = QUEUE_TICKET_STATUS.COMPLETED;
      updateApt.status = dbStatus;
      updateApt.completedAt = nowStr;
      updateApt.actualCompletedAt = nowStr;
      updateTicket.status = ticketStatus;
      updateTicket.completedAt = nowStr;
      updateTicket.actualEnd = nowStr;
    } else if (status === DOMAIN_APPOINTMENT_STATUS.CANCELLED) {
      dbStatus = DB_APPOINTMENT_STATUS.CANCELLED;
      ticketStatus = QUEUE_TICKET_STATUS.CANCELLED;
      updateApt.status = dbStatus;
      updateApt.cancelledAt = nowStr;
      if (cancellationReason) {
        updateApt.cancelReason = cancellationReason;
      }
      updateTicket.status = ticketStatus;

      let targetSessionId = existing.scheduleSessionId;
      if (
        !targetSessionId &&
        existing.practitionerId &&
        existing.scheduledDate
      ) {
        const apptStart =
          existing.scheduledStartTime?.length === 5
            ? `${existing.scheduledStartTime}:00`
            : existing.scheduledStartTime || '08:00:00';
        const candidateSessions =
          await db.query.practitionerScheduleSessions.findMany({
            where: and(
              eq(
                practitionerScheduleSessions.practitionerId,
                existing.practitionerId,
              ),
              eq(
                practitionerScheduleSessions.scheduleDate,
                existing.scheduledDate,
              ),
            ),
          });
        const matched =
          candidateSessions.find((s) => {
            const sStart =
              s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime;
            const sEnd = s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime;
            return apptStart >= sStart && apptStart < sEnd;
          }) || candidateSessions[0];
        if (matched) targetSessionId = matched.id;
      }

      if (targetSessionId && existing.status !== 'cancelled') {
        const [session] = await db
          .select()
          .from(practitionerScheduleSessions)
          .where(eq(practitionerScheduleSessions.id, targetSessionId));
        if (session) {
          const newAvailable = Math.min(
            session.capacity,
            session.availableSlots + 1,
          );
          await db
            .update(practitionerScheduleSessions)
            .set({
              availableSlots: newAvailable,
              updatedAt: nowStr,
            })
            .where(eq(practitionerScheduleSessions.id, session.id));
        }
      }
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

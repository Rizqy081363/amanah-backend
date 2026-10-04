import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import { patientProfiles } from '@database/schema';
import { APPOINTMENT_EVENTS } from '@modules/appointments/domain/constants/appointment-lifecycle.constants';
import {
  type DomainEvent,
  type NotificationPublisher,
} from '@modules/notifications/contracts/domain-event.interface';
import {
  formatClockTime,
  parseClockTime,
} from '@modules/schedules/domain/schedule-projection';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

export interface PublishRescheduleNotificationsParams {
  notificationPublisher?: NotificationPublisher;
  db: DrizzleDatabase;
  appointmentsToMove: any[];
  targetDate: string;
  targetStartTime: string;
  durationMinutes: number;
  practitioner: {
    id: string;
    displayName?: string | null;
  };
  notes?: string | null;
  reason?: string | null;
}

export async function publishRescheduleNotifications(
  params: PublishRescheduleNotificationsParams,
): Promise<void> {
  const {
    notificationPublisher,
    db,
    appointmentsToMove,
    targetDate,
    targetStartTime,
    durationMinutes,
    practitioner,
    notes,
    reason,
  } = params;

  if (!notificationPublisher || appointmentsToMove.length === 0) {
    return;
  }

  const startMin = parseClockTime(targetStartTime);

  for (let i = 0; i < appointmentsToMove.length; i++) {
    const appt = appointmentsToMove[i];
    const apptStartMin = startMin + i * durationMinutes;
    const apptEndMin = apptStartMin + durationMinutes;
    const apptStartTime = formatClockTime(apptStartMin);
    const apptEndTime = formatClockTime(apptEndMin);

    let patientUserId = (appt as any).patientProfile?.userId || null;
    let patientName = (appt as any).patientProfile?.fullName || 'Pasien';

    if (!patientUserId && appt.patientId) {
      const profile = await db.query.patientProfiles.findFirst({
        where: eq(patientProfiles.id, appt.patientId),
      });
      if (profile) {
        patientUserId = profile.userId;
        patientName = profile.fullName;
      }
    }

    const domainEvent: DomainEvent = {
      eventId: randomUUID(),
      eventType: APPOINTMENT_EVENTS.RESCHEDULED,
      version: 1,
      occurredAt: new Date().toISOString(),
      module: 'appointments',
      payload: {
        appointmentId: appt.id,
        patientId: appt.patientId,
        patientUserId,
        patientName,
        doctorName: practitioner.displayName || 'Dokter',
        practitionerId: practitioner.id,
        targetDate,
        targetStartTime: `${apptStartTime}:00`,
        targetEndTime: `${apptEndTime}:00`,
        appointmentDate: targetDate,
        queueNumber: appt.bookingCode || null,
        status: appt.status,
        reason: notes || reason || 'Penyesuaian jadwal praktik dokter',
        rescheduledByRole: 'admin',
      },
      actor: {
        roleCode: 'ADMIN',
      },
    };

    await notificationPublisher.publish(domainEvent);
  }
}

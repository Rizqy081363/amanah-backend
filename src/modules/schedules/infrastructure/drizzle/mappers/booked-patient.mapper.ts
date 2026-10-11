import { AppointmentTemporalStatusHelper } from '@modules/appointments/domain/helpers/appointment-temporal-status.helper';
import { computeConsultationMetrics } from '@modules/appointments/domain/helpers/consultation-duration.helper';
import { APPOINTMENT_STATUS_BADGE_MAP } from '@modules/schedules/domain/constants/schedule.constants';
import type { BookedPatientEntity } from '@modules/schedules/domain/entities/schedule.entity';

export class BookedPatientMapper {
  static calculateAgeString(birthDate?: string | Date | null): string {
    if (!birthDate) return '-';
    const birth = new Date(birthDate);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      years--;
    }
    return `${Math.max(0, years)} Thn`;
  }

  static toEntity(apt: any): BookedPatientEntity {
    const ageStr = BookedPatientMapper.calculateAgeString(
      apt.patientProfile?.birthDate,
    );

    const queueNumber =
      apt.queueTickets?.[0]?.queueNumber ||
      `#${apt.bookingCode ? apt.bookingCode.slice(-2) : '01'}`;

    const start = apt.scheduledStartTime
      ? apt.scheduledStartTime.slice(0, 5)
      : '08:00';
    const end = apt.scheduledEndTime
      ? apt.scheduledEndTime.slice(0, 5)
      : '09:30';

    let etaRange: string | null = null;
    if (apt.estimatedStartAt) {
      const estStart = new Date(apt.estimatedStartAt);
      const estEnd = apt.estimatedEndAt
        ? new Date(apt.estimatedEndAt)
        : new Date(estStart.getTime() + 20 * 60_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      etaRange = `${pad(estStart.getUTCHours())}:${pad(estStart.getUTCMinutes())} - ${pad(estEnd.getUTCHours())}:${pad(estEnd.getUTCMinutes())} WIB`;
    }

    const timeSlot = etaRange || `${start} - ${end} WIB`;

    const sessionTitle = apt.session
      ? `Sesi ${apt.session}`
      : 'Sesi Praktek';

    const room = apt.clinicRoom?.name || null;

    const isElapsed = AppointmentTemporalStatusHelper.isElapsed({
      scheduledDate: apt.scheduledDate,
      scheduledStartTime: apt.scheduledStartTime,
      scheduledEndTime: apt.scheduledEndTime,
    });
    const status = AppointmentTemporalStatusHelper.resolveDbStatus(
      apt.status,
      isElapsed,
    );
    const statusBadge = APPOINTMENT_STATUS_BADGE_MAP[status] || status;

    const actualStartedAt = apt.actualStartedAt
      ? new Date(apt.actualStartedAt)
      : apt.startedAt
        ? new Date(apt.startedAt)
        : apt.queueTickets?.[0]?.startedAt
          ? new Date(apt.queueTickets[0].startedAt)
          : null;

    const actualCompletedAt = apt.actualCompletedAt
      ? new Date(apt.actualCompletedAt)
      : apt.completedAt
        ? new Date(apt.completedAt)
        : apt.queueTickets?.[0]?.completedAt
          ? new Date(apt.queueTickets[0].completedAt)
          : null;

    const { elapsedSeconds, formattedDuration } = computeConsultationMetrics(
      actualStartedAt,
      actualCompletedAt,
      status,
    );

    return {
      id: apt.patientProfile?.id || apt.patientId,
      appointmentId: apt.id,
      fullName: apt.patientProfile?.fullName || 'Pasien',
      medicalRecordNumber:
        apt.patientProfile?.medicalRecordNumber || 'RM-UNKNOWN',
      age: ageStr,
      gender:
        apt.patientProfile?.gender === 'female' ? 'Perempuan' : 'Laki-laki',
      queueNumber,
      timeSlot,
      etaRange,
      estimatedStartAt: apt.estimatedStartAt || null,
      estimatedEndAt: apt.estimatedEndAt || null,
      sessionTitle,
      room,
      guardian: apt.guardianNameSnapshot || null,
      complaint: apt.complaint || null,
      status,
      statusBadge,
      avatarUrl: apt.patientProfile?.avatarUrl || null,
      actualStartedAt,
      actualCompletedAt,
      consultationElapsedSeconds: elapsedSeconds,
      consultationDurationFormatted: formattedDuration,
    };
  }
}

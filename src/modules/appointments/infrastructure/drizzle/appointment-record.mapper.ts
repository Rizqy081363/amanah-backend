import { generateEntityVersion } from '../../../../common/occ';
import {
  type CanonicalSessionName,
  type CanonicalStaffShift,
  resolveCanonicalShift,
  resolveSessionFromTime,
  SHIFT_TO_SESSION_MAP,
} from '../../../schedules/domain/constants/schedule-shift.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { computeConsultationMetrics } from '../../domain/helpers/consultation-duration.helper';
import {
  DB_APPOINTMENT_STATUS,
  DOMAIN_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import { isAppointmentLate } from '../../domain/services/appointment-lateness.predicate';
import {
  resolveAllowedActions,
  toDomainStatus,
} from '../../domain/types/appointment.types';

export class AppointmentRecordMapper {
  static resolveSession(apt: any): CanonicalSessionName {
    if (apt.practitionerScheduleSession?.sessionShift) {
      const shift = apt.practitionerScheduleSession
        .sessionShift as CanonicalStaffShift;
      if (SHIFT_TO_SESSION_MAP[shift]) {
        return SHIFT_TO_SESSION_MAP[shift];
      }
    }
    if (apt.practitionerScheduleSession?.sessionLabel) {
      return resolveCanonicalShift({
        session: apt.practitionerScheduleSession.sessionLabel,
      }).session;
    }
    return resolveSessionFromTime(apt.scheduledStartTime);
  }

  static toEntity(
    apt: any,
    ticket?: any | null,
    poliklinikIdOverride?: string,
    windowHours?: number,
  ): AppointmentEntity {
    let domainStatus = toDomainStatus(apt.status);
    let rawStatus = apt.status;

    if (
      windowHours !== undefined &&
      (apt.status === DB_APPOINTMENT_STATUS.BOOKED ||
        apt.status === DB_APPOINTMENT_STATUS.WAITING ||
        apt.status === DB_APPOINTMENT_STATUS.CHECKED_IN)
    ) {
      const scheduledDateObj = new Date(
        `${apt.scheduledDate}T${apt.scheduledStartTime || '00:00:00'}`,
      );
      if (isAppointmentLate(scheduledDateObj, new Date(), windowHours)) {
        domainStatus = DOMAIN_APPOINTMENT_STATUS.LATE;
        rawStatus = DB_APPOINTMENT_STATUS.LATE;
      }
    }

    const session = AppointmentRecordMapper.resolveSession(apt);

    const poliId =
      poliklinikIdOverride ||
      apt.clinicRoom?.unitId ||
      apt.clinicRoom?.clinicUnit?.id ||
      '';

    const primaryAffiliation = apt.patientProfile?.patientAffiliations?.[0];
    const isAffiliated =
      !apt.patientProfile?.userId && Boolean(primaryAffiliation);
    const affiliationRelationship =
      primaryAffiliation?.relationLabel ||
      primaryAffiliation?.relationshipType ||
      null;
    const parentUserId =
      apt.patientProfile?.userId ||
      primaryAffiliation?.userId ||
      apt.createdBy ||
      null;
    const parentUserName =
      primaryAffiliation?.user?.name || primaryAffiliation?.user?.email || null;

    const patientUserId = parentUserId;
    const patientAvatarUrl =
      apt.patientProfile?.avatarUrl ||
      (patientUserId ? `/api/v1/users/${patientUserId}/avatar` : null);

    const doctorUserId = apt.practitioner?.staffProfile?.userId || null;
    const doctorAvatarUrl =
      apt.practitioner?.staffProfile?.avatarUrl ||
      (doctorUserId ? `/api/v1/users/${doctorUserId}/avatar` : null);

    const actualStartedAt = apt.actualStartedAt
      ? new Date(apt.actualStartedAt)
      : apt.startedAt
        ? new Date(apt.startedAt)
        : ticket?.startedAt
          ? new Date(ticket.startedAt)
          : null;

    const actualCompletedAt = apt.actualCompletedAt
      ? new Date(apt.actualCompletedAt)
      : apt.completedAt
        ? new Date(apt.completedAt)
        : ticket?.completedAt
          ? new Date(ticket.completedAt)
          : null;

    const { elapsedSeconds, formattedDuration } = computeConsultationMetrics(
      actualStartedAt,
      actualCompletedAt,
      domainStatus,
    );

    const estimatedStartAt = apt.estimatedStartAt
      ? new Date(apt.estimatedStartAt)
      : null;
    const estimatedEndAt = apt.estimatedEndAt
      ? new Date(apt.estimatedEndAt)
      : null;

    let etaRange: string | null = null;
    if (estimatedStartAt) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const startH = pad(estimatedStartAt.getHours());
      const startM = pad(estimatedStartAt.getMinutes());
      if (estimatedEndAt) {
        const endH = pad(estimatedEndAt.getHours());
        const endM = pad(estimatedEndAt.getMinutes());
        etaRange = `${startH}:${startM} - ${endH}:${endM}`;
      } else {
        etaRange = `~${startH}:${startM}`;
      }
    } else if (apt.scheduledStartTime) {
      etaRange = apt.scheduledStartTime.slice(0, 5);
      if (apt.scheduledEndTime) {
        etaRange += ` - ${apt.scheduledEndTime.slice(0, 5)}`;
      }
    }

    const numQueue = Number(apt.queueNumber) || 1;
    const aheadCount =
      domainStatus === DOMAIN_APPOINTMENT_STATUS.BOOKED ||
      domainStatus === DOMAIN_APPOINTMENT_STATUS.WAITING
        ? Math.max(0, numQueue - 1)
        : 0;

    return {
      id: apt.id,
      bookingCode: apt.bookingCode || null,
      medicalFlow: apt.medicalFlow || null,
      patientId: apt.patientId,
      patientUserId,
      createdBy: apt.createdBy || null,
      isAffiliated,
      affiliationRelationship,
      parentUserId,
      parentUserName,
      patientName: apt.patientProfile?.fullName || 'Pasien Amanah',
      patientAvatarUrl,
      poliklinikId: poliId,
      poliklinikName: apt.clinicRoom?.clinicUnit?.name || apt.clinicService?.name || 'Poliklinik Amanah',
      layananId: apt.serviceId,
      layananName: apt.clinicService?.name || 'Konsultasi Dokter',
      staffId: apt.practitionerId || null,
      doctorName:
        apt.practitioner?.staffProfile?.fullName ||
        apt.practitioner?.name ||
        null,
      doctorSpecialty: apt.practitioner?.medicalSpecialty?.name || null,
      doctorAvatarUrl,
      roomName: apt.clinicRoom?.name || null,
      roomLocation: apt.clinicRoom?.location || null,
      appointmentDate: apt.scheduledDate,
      scheduledStartTime: apt.scheduledStartTime || null,
      scheduledEndTime: apt.scheduledEndTime || null,
      estimatedDurationMinutes:
        apt.practitioner?.consultationDurationMinutes ?? 30,
      session,
      queueNumber:
        ticket?.queueNumber ||
        (apt.clinicRoom?.clinicUnit?.queuePrefix && apt.queueNumber
          ? `${apt.clinicRoom.clinicUnit.queuePrefix}-${String(apt.queueNumber).padStart(3, '0')}`
          : apt.queueNumber
            ? String(apt.queueNumber)
            : '1'),
      ticketStatus: ticket?.status || QUEUE_TICKET_STATUS.WAITING,
      status: domainStatus,
      rawStatus,
      allowedActions: resolveAllowedActions(domainStatus),
      visitType:
        apt.visitType === 'follow_up' ? 'Kontrol Ulang' : 'Pemeriksaan Baru',
      complaint: apt.complaint || null,
      cancellationReason: apt.cancelReason || null,
      calledAt: ticket?.calledAt ? new Date(ticket.calledAt) : null,
      lastCalledAt: apt.lastCalledAt
        ? new Date(apt.lastCalledAt)
        : ticket?.calledAt
          ? new Date(ticket.calledAt)
          : null,
      checkedInAt: apt.checkedInAt ? new Date(apt.checkedInAt) : null,
      actualStartedAt,
      actualCompletedAt,
      consultationElapsedSeconds: elapsedSeconds,
      consultationDurationFormatted: formattedDuration,
      estimatedStartAt,
      estimatedEndAt,
      etaRange,
      aheadCount,
      completedAt: apt.completedAt ? new Date(apt.completedAt) : null,
      createdAt: new Date(apt.createdAt),
      updatedAt: new Date(apt.updatedAt),
      version: generateEntityVersion(apt.updatedAt),
    };
  }
}

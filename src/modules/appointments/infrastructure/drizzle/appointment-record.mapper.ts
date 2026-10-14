import { generateEntityVersion } from '../../../../common/occ';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  type CanonicalSessionName,
  resolveCanonicalShift,
  resolveSessionFromTime,
} from '../../../schedules/domain/constants/schedule-shift.constants';
import { formatIndoDate } from '../../../schedules/domain/services/schedule-date.formatter';
import {
  DB_APPOINTMENT_STATUS,
  DOMAIN_APPOINTMENT_STATUS,
  QUEUE_TICKET_STATUS,
} from '../../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { computeConsultationMetrics } from '../../domain/helpers/consultation-duration.helper';
import { isAppointmentLate } from '../../domain/services/appointment-lateness.predicate';
import {
  resolveAllowedActions,
  toDomainStatus,
} from '../../domain/types/appointment.types';

export class AppointmentRecordMapper {
  static resolveSession(apt: any): CanonicalSessionName {
    if (apt.session) {
      return resolveCanonicalShift({ session: apt.session }).session;
    }
    return resolveSessionFromTime(apt.scheduledStartTime);
  }

  static toEntity(
    apt: any,
    ticket?: any | null,
    poliklinikIdOverride?:
      | string
      | { poliklinikId: string; poliklinikName: string }
      | null,
    windowHours?: number,
    clinicTimeService?: ClinicTimeService,
    isDoctorServing?: boolean,
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
      const tz =
        clinicTimeService?.getTimezone() ||
        process.env.CLINIC_TIMEZONE ||
        'Asia/Jakarta';
      const tzAbbr =
        clinicTimeService?.getTimezoneAbbreviation(estimatedStartAt) || 'WIB';

      const formatTime = (d: Date): string => {
        if (clinicTimeService) {
          return clinicTimeService.formatTime(d).slice(0, 5);
        }
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d);
      };

      const startStr = formatTime(estimatedStartAt);
      if (estimatedEndAt) {
        const endStr = formatTime(estimatedEndAt);
        etaRange = `${startStr} - ${endStr} ${tzAbbr}`;
      } else {
        etaRange = `~${startStr} ${tzAbbr}`;
      }
    } else if (apt.scheduledStartTime) {
      etaRange = apt.scheduledStartTime.slice(0, 5);
      if (apt.scheduledEndTime) {
        etaRange += ` - ${apt.scheduledEndTime.slice(0, 5)} WIB`;
      } else {
        etaRange += ' WIB';
      }
    }

    const effectivePosition =
      apt.queueNumber !== undefined && apt.queueNumber !== null
        ? Number(apt.queueNumber)
        : ticket?.waitingPosition !== undefined &&
            ticket?.waitingPosition !== null
          ? Number(ticket.waitingPosition)
          : 1;
    const aheadCount =
      domainStatus === DOMAIN_APPOINTMENT_STATUS.BOOKED ||
      domainStatus === DOMAIN_APPOINTMENT_STATUS.WAITING
        ? Math.max(0, effectivePosition - 1)
        : 0;

    const overrideObj =
      typeof poliklinikIdOverride === 'object' && poliklinikIdOverride !== null
        ? (poliklinikIdOverride as {
            poliklinikId: string;
            poliklinikName: string;
          })
        : null;

    const poliId =
      overrideObj?.poliklinikId ||
      apt.clinicRoom?.unitId ||
      apt.clinicRoom?.clinicUnit?.id ||
      apt.practitioner?.clinicRoom?.unitId ||
      apt.practitioner?.clinicRoom?.clinicUnit?.id ||
      apt.practitioner?.staffProfile?.primaryUnitId ||
      apt.practitioner?.staffProfile?.clinicUnit?.id ||
      (typeof poliklinikIdOverride === 'string' ? poliklinikIdOverride : '');

    const resolvedPoliName =
      overrideObj?.poliklinikName ||
      apt.clinicRoom?.clinicUnit?.name ||
      apt.practitioner?.clinicRoom?.clinicUnit?.name ||
      apt.practitioner?.staffProfile?.clinicUnit?.name ||
      '';

    const hasDoctor = Boolean(apt.practitionerId || apt.practitioner);
    const hasRoom = Boolean(apt.roomId || apt.clinicRoom);

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
      poliklinikName: resolvedPoliName,
      layananId: apt.serviceId,
      layananName: apt.clinicService?.name || 'Konsultasi Dokter',
      staffId: apt.practitionerId || null,
      doctorId: apt.practitionerId || null,
      doctorName:
        apt.practitioner?.staffProfile?.fullName ||
        apt.practitioner?.name ||
        null,
      doctorSpecialty: apt.practitioner?.medicalSpecialty?.name || null,
      doctorAvatarUrl,
      roomId: apt.roomId || null,
      roomName: apt.clinicRoom?.name || null,
      roomLocation: apt.clinicRoom?.location || null,
      appointmentDate: apt.scheduledDate,
      appointmentDateFormatted: formatIndoDate(apt.scheduledDate),
      scheduledStartTime: apt.scheduledStartTime || null,
      scheduledEndTime: apt.scheduledEndTime || null,
      estimatedDurationMinutes:
        apt.practitioner?.consultationDurationMinutes ?? 30,
      session,
      sessionName: `Sesi ${session}`,
      queueNumber:
        ticket?.queueNumber ||
        (apt.clinicRoom?.clinicUnit?.queuePrefix && apt.queueNumber
          ? `${apt.clinicRoom.clinicUnit.queuePrefix}-${String(apt.queueNumber).padStart(3, '0')}`
          : apt.queueNumber
            ? String(apt.queueNumber)
            : ''),
      ticketStatus: ticket?.status || QUEUE_TICKET_STATUS.WAITING,
      status: domainStatus,
      rawStatus,
      allowedActions: resolveAllowedActions(domainStatus, {
        hasDoctor,
        hasRoom,
        aheadCount,
        isDoctorServing,
      }),
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

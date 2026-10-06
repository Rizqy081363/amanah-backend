import { generateEntityVersion } from '../../../../common/occ';
import {
  type CanonicalSessionName,
  type CanonicalStaffShift,
  resolveCanonicalShift,
  resolveSessionFromTime,
  SHIFT_TO_SESSION_MAP,
} from '../../../schedules/domain/constants/schedule-shift.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
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
  ): AppointmentEntity {
    const domainStatus = toDomainStatus(apt.status);
    const session = AppointmentRecordMapper.resolveSession(apt);

    const poliId =
      poliklinikIdOverride ||
      apt.clinicRoom?.unitId ||
      apt.clinicRoom?.clinicUnit?.id ||
      '';

    const patientUserId = apt.patientProfile?.userId || null;
    const patientAvatarUrl =
      apt.patientProfile?.avatarUrl ||
      (patientUserId ? `/api/v1/users/${patientUserId}/avatar` : null);

    const doctorUserId = apt.practitioner?.staffProfile?.userId || null;
    const doctorAvatarUrl =
      apt.practitioner?.staffProfile?.avatarUrl ||
      (doctorUserId ? `/api/v1/users/${doctorUserId}/avatar` : null);

    return {
      id: apt.id,
      bookingCode: apt.bookingCode || null,
      medicalFlow: apt.medicalFlow || null,
      patientId: apt.patientId,
      patientUserId,
      patientName: apt.patientProfile?.fullName || 'Pasien Amanah',
      patientAvatarUrl,
      poliklinikId: poliId,
      poliklinikName: apt.clinicRoom?.clinicUnit?.name || 'Poliklinik Amanah',
      layananId: apt.serviceId,
      layananName: apt.clinicService?.name || 'Konsultasi Dokter',
      staffId: apt.practitionerId || null,
      doctorName:
        apt.practitioner?.staffProfile?.fullName ||
        apt.practitioner?.name ||
        'Dokter Amanah',
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
      queueNumber: apt.queueNumber ? String(apt.queueNumber) : (ticket?.queueNumber || '1'),
      ticketStatus: ticket?.status || 'waiting',
      status: domainStatus,
      rawStatus: apt.status,
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
      actualStartedAt: apt.actualStartedAt ? new Date(apt.actualStartedAt) : null,
      actualCompletedAt: apt.actualCompletedAt ? new Date(apt.actualCompletedAt) : null,
      estimatedStartAt: apt.estimatedStartAt ? new Date(apt.estimatedStartAt) : null,
      estimatedEndAt: apt.estimatedEndAt ? new Date(apt.estimatedEndAt) : null,
      completedAt: apt.completedAt ? new Date(apt.completedAt) : null,
      createdAt: new Date(apt.createdAt),
      updatedAt: new Date(apt.updatedAt),
      version: generateEntityVersion(apt.updatedAt),
    };
  }
}

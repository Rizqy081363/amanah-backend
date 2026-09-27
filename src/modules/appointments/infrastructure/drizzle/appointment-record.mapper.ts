import { generateEntityVersion } from '../../../../common/occ';
import {
  type CanonicalSessionName,
  type CanonicalStaffShift,
  resolveCanonicalShift,
  resolveSessionFromTime,
  SHIFT_TO_SESSION_MAP,
} from '../../../schedules/domain/constants/schedule-shift.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';

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
    let entityStatus: AppointmentEntity['status'] = 'SUDAH_BUAT_JANJI';
    if (apt.status === 'in_service') {
      entityStatus = 'SEDANG_DIPERIKSA';
    } else if (apt.status === 'completed') {
      entityStatus = 'SELESAI';
    } else if (apt.status === 'cancelled') {
      entityStatus = 'BATAL';
    } else if (apt.status === 'waiting' || apt.status === 'checked_in') {
      entityStatus = 'MENUNGGU';
    }

    const session = AppointmentRecordMapper.resolveSession(apt);

    const poliId =
      poliklinikIdOverride ||
      apt.clinicRoom?.unitId ||
      apt.clinicRoom?.clinicUnit?.id ||
      '';

    return {
      id: apt.id,
      patientId: apt.patientId,
      patientName: apt.patientProfile?.fullName || 'Pasien Amanah',
      poliklinikId: poliId,
      poliklinikName: apt.clinicRoom?.clinicUnit?.name || 'Poliklinik Amanah',
      layananId: apt.serviceId,
      layananName: apt.clinicService?.name || 'Konsultasi Dokter',
      staffId: apt.practitionerId || null,
      doctorName:
        apt.practitioner?.staffProfile?.fullName ||
        apt.practitioner?.name ||
        'Dokter Amanah',
      appointmentDate: apt.scheduledDate,
      scheduledStartTime: apt.scheduledStartTime || null,
      scheduledEndTime: apt.scheduledEndTime || null,
      estimatedDurationMinutes:
        apt.practitioner?.consultationDurationMinutes ?? 30,
      session,
      queueNumber: ticket?.queueNumber || 'P-001',
      ticketStatus: ticket?.status || 'waiting',
      status: entityStatus,
      visitType:
        apt.visitType === 'follow_up' ? 'Kontrol Ulang' : 'Pemeriksaan Baru',
      complaint: apt.complaint || null,
      cancellationReason: apt.cancelReason || null,
      calledAt: ticket?.calledAt ? new Date(ticket.calledAt) : null,
      completedAt: apt.completedAt ? new Date(apt.completedAt) : null,
      createdAt: new Date(apt.createdAt),
      updatedAt: new Date(apt.updatedAt),
      version: generateEntityVersion(apt.updatedAt),
    };
  }
}

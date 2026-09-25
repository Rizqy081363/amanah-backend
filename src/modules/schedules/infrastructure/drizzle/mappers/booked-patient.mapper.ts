import type { BookedPatientEntity } from '../../../domain/entities/schedule.entity';

const STATUS_BADGE_MAP: Record<string, string> = {
  booked: 'Booked',
  checked_in: 'Check In',
  waiting: 'Menunggu',
  in_service: 'Pemeriksaan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

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
    const timeSlot = `${start} - ${end} WIB`;

    const sessionTitle = apt.practitionerScheduleSession?.sessionLabel
      ? `Sesi ${apt.practitionerScheduleSession.sessionLabel}`
      : 'Sesi Praktek';

    const room =
      apt.clinicRoom?.name ||
      apt.practitionerScheduleSession?.clinicRoom?.name ||
      'Ruang Periksa';

    const status = apt.status;
    const statusBadge = STATUS_BADGE_MAP[status] || status;

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
      sessionTitle,
      room,
      guardian: apt.guardianNameSnapshot || null,
      complaint: apt.complaint || null,
      status,
      statusBadge,
      avatarUrl: apt.patientProfile?.avatarUrl || null,
    };
  }
}

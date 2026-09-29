import type { CanonicalSessionName } from '../../../schedules/domain/constants/schedule-shift.constants';

export class AppointmentEntity {
  id: string;
  patientId: string;
  patientName?: string;
  poliklinikId: string;
  poliklinikName?: string;
  layananId: string;
  layananName?: string;
  staffId?: string | null;
  doctorName?: string | null;
  doctorSpecialty?: string | null;
  roomName?: string | null;
  roomLocation?: string | null;
  appointmentDate: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  estimatedDurationMinutes?: number;
  session: CanonicalSessionName;
  queueNumber: string;
  ticketStatus?: string;
  status:
    | 'SUDAH_BUAT_JANJI'
    | 'SUDAH_DATANG'
    | 'MENUNGGU'
    | 'SEDANG_DIPERIKSA'
    | 'SELESAI'
    | 'BATAL';
  visitType: 'Pemeriksaan Baru' | 'Kontrol Ulang';
  complaint?: string | null;
  cancellationReason?: string | null;
  calledAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version?: string;
}

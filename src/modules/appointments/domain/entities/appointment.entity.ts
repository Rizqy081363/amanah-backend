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
  appointmentDate: string;
  session: 'PAGI' | 'SIANG' | 'MALAM';
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
}

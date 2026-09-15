export class AppointmentEntity {
  id: string;
  patientId: string;
  poliklinikId: string;
  layananId: string;
  staffId?: string | null;
  appointmentDate: string;
  session: 'PAGI' | 'SIANG' | 'MALAM';
  queueNumber: string;
  status:
    | 'SUDAH_BUAT_JANJI'
    | 'SUDAH_DATANG'
    | 'MENUNGGU'
    | 'SEDANG_DIPERIKSA'
    | 'SELESAI'
    | 'BATAL';
  visitType: 'Pemeriksaan Baru' | 'Kontrol Ulang';
  complaint?: string | null;
  calledAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

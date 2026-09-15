export class AttendanceEntity {
  id: string;
  staffId: string;
  scanTime: Date;
  shift: 'PAGI' | 'SIANG' | 'MALAM';
  status: 'HADIR' | 'TERLAMBAT' | 'TIDAK_HADIR';
  deviceInfo?: string | null;
  createdAt: Date;
}

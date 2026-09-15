import { AttendanceEntity } from '../entities/attendance.entity';

export const ATTENDANCE_REPOSITORY = 'ATTENDANCE_REPOSITORY';

export interface AttendanceRepository {
  recordScan(data: {
    staffId: string;
    shift: 'PAGI' | 'SIANG' | 'MALAM';
    status: 'HADIR' | 'TERLAMBAT' | 'TIDAK_HADIR';
    deviceInfo?: string;
  }): Promise<AttendanceEntity>;

  findByStaffId(staffId: string, limit?: number): Promise<AttendanceEntity[]>;

  findDaily(date: string): Promise<any[]>;
}

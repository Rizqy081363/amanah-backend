import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  staffAttendanceRecords,
  staffProfiles,
} from '../../../../database/schema';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import { AttendanceRepository } from '../../domain/repositories/attendance.repository';

@Injectable()
export class AttendanceDrizzleRepository implements AttendanceRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(r: any): AttendanceEntity {
    const shiftName =
      r.shift === 'afternoon'
        ? 'SIANG'
        : r.shift === 'night'
          ? 'MALAM'
          : 'PAGI';
    const statusName =
      r.status === 'late'
        ? 'TERLAMBAT'
        : r.status === 'present'
          ? 'HADIR'
          : 'TIDAK_HADIR';

    return {
      id: r.id,
      staffId: r.staffProfileId,
      scanTime: r.checkInAt ? new Date(r.checkInAt) : new Date(r.createdAt),
      shift: shiftName,
      status: statusName,
      deviceInfo: r.notes || null,
      createdAt: new Date(r.createdAt),
    };
  }

  async recordScan(data: {
    staffId: string;
    shift: 'PAGI' | 'SIANG' | 'MALAM';
    status: 'HADIR' | 'TERLAMBAT' | 'TIDAK_HADIR';
    deviceInfo?: string;
  }): Promise<AttendanceEntity> {
    const shift =
      data.shift === 'SIANG'
        ? 'afternoon'
        : data.shift === 'MALAM'
          ? 'night'
          : 'morning';

    const status = data.status === 'TERLAMBAT' ? 'late' : 'present';
    const todayStr = new Date().toISOString().split('T')[0];

    const [record] = await this.db
      .insert(staffAttendanceRecords)
      .values({
        staffProfileId: data.staffId,
        attendanceDate: todayStr,
        shift,
        status,
        checkInAt: new Date().toISOString(),
        recordedMethod: 'qr_scan',
        notes: data.deviceInfo || null,
      })
      .onConflictDoUpdate({
        target: [
          staffAttendanceRecords.staffProfileId,
          staffAttendanceRecords.attendanceDate,
          staffAttendanceRecords.shift,
        ],
        set: {
          status,
          checkInAt: new Date().toISOString(),
          recordedMethod: 'qr_scan',
          notes: data.deviceInfo || null,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    return this.mapRecordToEntity(record);
  }

  async findByStaffId(
    staffId: string,
    limit: number = 30,
  ): Promise<AttendanceEntity[]> {
    const records = await this.db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.staffProfileId, staffId),
      orderBy: [desc(staffAttendanceRecords.createdAt)],
      limit,
    });

    return records.map((r) => this.mapRecordToEntity(r));
  }

  async findDaily(date: string): Promise<any[]> {
    const records = await this.db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.attendanceDate, date),
      with: {
        staffProfile: true,
      },
      orderBy: [desc(staffAttendanceRecords.createdAt)],
    });

    return records.map((r) => ({
      ...this.mapRecordToEntity(r),
      staff: r.staffProfile
        ? {
            id: r.staffProfile.id,
            fullName: r.staffProfile.fullName,
            profession: r.staffProfile.positionTitle,
            idCardNumber: r.staffProfile.staffCode,
          }
        : null,
    }));
  }
}

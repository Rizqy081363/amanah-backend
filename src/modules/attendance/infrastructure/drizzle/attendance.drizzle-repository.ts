import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, sql } from 'drizzle-orm';
import { AttendanceRepository } from '../../domain/repositories/attendance.repository';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffAttendances } from '../../../../database/schema';

@Injectable()
export class AttendanceDrizzleRepository implements AttendanceRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async recordScan(data: {
    staffId: string;
    shift: 'PAGI' | 'SIANG' | 'MALAM';
    status: 'HADIR' | 'TERLAMBAT' | 'TIDAK_HADIR';
    deviceInfo?: string;
  }): Promise<AttendanceEntity> {
    const [record] = await this.db
      .insert(staffAttendances)
      .values({
        staffId: data.staffId,
        shift: data.shift,
        status: data.status,
        deviceInfo: data.deviceInfo || null,
      })
      .returning();

    return record as unknown as AttendanceEntity;
  }

  async findByStaffId(
    staffId: string,
    limit: number = 30,
  ): Promise<AttendanceEntity[]> {
    const records = await this.db.query.staffAttendances.findMany({
      where: eq(staffAttendances.staffId, staffId),
      orderBy: [desc(staffAttendances.scanTime)],
      limit,
    });

    return records as unknown as AttendanceEntity[];
  }

  async findDaily(date: string): Promise<any[]> {
    return this.db.query.staffAttendances.findMany({
      where: sql`(${staffAttendances.scanTime}::date = ${date}::date OR (${staffAttendances.scanTime} AT TIME ZONE 'Asia/Jakarta')::date = ${date}::date)`,
      with: {
        staff: true,
      },
      orderBy: [desc(staffAttendances.scanTime)],
    });
  }
}

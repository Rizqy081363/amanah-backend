import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { staffAttendanceRecords } from '../../../../../database/schema';
import { AttendanceEntity } from '../../../domain/entities/attendance.entity';
import { AttendanceHistoryResultDto } from '../../../domain/repositories/attendance.repository';
import { AttendanceMapper } from '../mappers/attendance.mapper';

@Injectable()
export class AttendanceRecordsDrizzleRepo {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async saveAttendanceRecord(data: {
    staffProfileId: string;
    attendanceDate: string;
    shift: string;
    status: string;
    checkInAt: string;
    lateMinutes?: number | null;
    recordedMethod: string;
    sessionId?: string | null;
    qrSessionId?: string | null;
    isReplacement: boolean;
    replacementOpportunityId?: string | null;
    recordedBy?: string | null;
    notes?: string | null;
  }): Promise<AttendanceEntity> {
    const [record] = await this.db
      .insert(staffAttendanceRecords)
      .values({
        staffProfileId: data.staffProfileId,
        attendanceDate: data.attendanceDate,
        shift: data.shift as any,
        status: data.status as any,
        checkInAt: data.checkInAt,
        lateMinutes: data.lateMinutes,
        recordedMethod: data.recordedMethod as any,
        sessionId: data.sessionId,
        qrSessionId: data.qrSessionId,
        isReplacement: data.isReplacement,
        replacementOpportunityId: data.replacementOpportunityId,
        recordedBy: data.recordedBy,
        notes: data.notes,
      })
      .onConflictDoUpdate({
        target: [
          staffAttendanceRecords.staffProfileId,
          staffAttendanceRecords.attendanceDate,
          staffAttendanceRecords.shift,
        ],
        set: {
          status: data.status as any,
          checkInAt: data.checkInAt,
          checkOutAt: null,
          validatedDurationHours: '0.00',
          lateMinutes: data.lateMinutes,
          recordedMethod: data.recordedMethod as any,
          sessionId: data.sessionId,
          qrSessionId: data.qrSessionId || undefined,
          isReplacement: data.isReplacement,
          replacementOpportunityId: data.replacementOpportunityId,
          recordedBy: data.recordedBy,
          notes: data.notes,
          updatedAt: data.checkInAt,
        },
      })
      .returning();

    return AttendanceMapper.toAttendanceEntity(record);
  }

  async updateAttendanceRecord(
    id: string,
    data: {
      checkOutAt?: string | null;
      validatedDurationHours?: string | null;
      notes?: string | null;
      isEarlyDeparture?: boolean;
      updatedAt?: string;
    },
  ): Promise<AttendanceEntity> {
    const updateValues: Record<string, any> = {
      checkOutAt: data.checkOutAt,
      validatedDurationHours: data.validatedDurationHours,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    if (data.notes !== undefined) {
      updateValues.notes = data.notes;
    }
    if (data.isEarlyDeparture !== undefined) {
      updateValues.isEarlyDeparture = data.isEarlyDeparture;
    }

    const [updated] = await this.db
      .update(staffAttendanceRecords)
      .set(updateValues)
      .where(eq(staffAttendanceRecords.id, id))
      .returning();

    return AttendanceMapper.toAttendanceEntity(updated);
  }

  async findStaffAttendanceForDate(
    staffId: string,
    attendanceDate: string,
  ): Promise<AttendanceEntity | null> {
    const records = await this.db
      .select()
      .from(staffAttendanceRecords)
      .where(
        and(
          eq(staffAttendanceRecords.staffProfileId, staffId),
          eq(staffAttendanceRecords.attendanceDate, attendanceDate),
        ),
      )
      .orderBy(desc(staffAttendanceRecords.checkInAt))
      .limit(1);

    return records.length > 0
      ? AttendanceMapper.toAttendanceEntity(records[0])
      : null;
  }

  async findStaffAttendanceForDateAndShift(
    staffId: string,
    attendanceDate: string,
    shift: string,
  ): Promise<AttendanceEntity | null> {
    const records = await this.db
      .select()
      .from(staffAttendanceRecords)
      .where(
        and(
          eq(staffAttendanceRecords.staffProfileId, staffId),
          eq(staffAttendanceRecords.attendanceDate, attendanceDate),
          eq(staffAttendanceRecords.shift, shift as any),
        ),
      )
      .orderBy(desc(staffAttendanceRecords.checkInAt))
      .limit(1);

    return records.length > 0
      ? AttendanceMapper.toAttendanceEntity(records[0])
      : null;
  }

  async findOpenAttendanceRecord(
    staffId: string,
    attendanceDate: string,
  ): Promise<AttendanceEntity | null> {
    const records = await this.db
      .select()
      .from(staffAttendanceRecords)
      .where(
        and(
          eq(staffAttendanceRecords.staffProfileId, staffId),
          eq(staffAttendanceRecords.attendanceDate, attendanceDate),
          isNotNull(staffAttendanceRecords.checkInAt),
          isNull(staffAttendanceRecords.checkOutAt),
        ),
      )
      .orderBy(desc(staffAttendanceRecords.checkInAt))
      .limit(1);

    return records.length > 0
      ? AttendanceMapper.toAttendanceEntity(records[0])
      : null;
  }

  async findByStaffId(
    staffId: string,
    limit: number = 30,
  ): Promise<AttendanceEntity[]> {
    const records = await this.db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.staffProfileId, staffId),
      orderBy: [desc(staffAttendanceRecords.attendanceDate)],
      limit,
    });

    return records.map((r: any) => AttendanceMapper.toAttendanceEntity(r));
  }

  async findHistoryWithSummaryByStaffId(
    staffId: string,
    limit: number = 30,
  ): Promise<AttendanceHistoryResultDto> {
    const records = await this.db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.staffProfileId, staffId),
      orderBy: [desc(staffAttendanceRecords.attendanceDate)],
      limit,
    });

    const entities = records.map((r: any) => AttendanceMapper.toAttendanceEntity(r));

    let totalWorkHours = 0;
    const distinctDates = new Set<string>();
    let hadirCount = 0;
    let telatCount = 0;
    let missedCount = 0;
    let cutiCount = 0;

    for (const r of records) {
      if (r.attendanceDate) {
        distinctDates.add(r.attendanceDate);
      }
      if (r.validatedDurationHours) {
        const val = parseFloat(r.validatedDurationHours);
        if (!isNaN(val)) totalWorkHours += val;
      }
      const st = (r.status || '').toLowerCase();
      if (st === 'present') {
        hadirCount++;
      } else if (st === 'late') {
        telatCount++;
      } else if (st === 'leave') {
        cutiCount++;
      } else if (st === 'absent' || st === 'missed') {
        missedCount++;
      }
    }

    totalWorkHours = Math.round(totalWorkHours * 10) / 10;

    return {
      records: entities,
      summary: {
        totalWorkHours,
        totalDays: distinctDates.size || entities.length,
        periodLabel: 'Periode Ini',
        facets: [
          { status: 'hadir', label: 'Hadir', count: hadirCount, color: '#10B981' },
          { status: 'telat', label: 'Telat', count: telatCount, color: '#F59E0B' },
          { status: 'missed', label: 'Missed', count: missedCount, color: '#EF4444' },
          { status: 'cuti', label: 'Cuti', count: cutiCount, color: '#8B5CF6' },
        ],
      },
    };
  }

  async findDailyWithStaff(date: string): Promise<any[]> {
    return this.db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.attendanceDate, date),
      with: {
        staffProfile: true,
      },
      orderBy: [desc(staffAttendanceRecords.checkInAt)],
    });
  }
}

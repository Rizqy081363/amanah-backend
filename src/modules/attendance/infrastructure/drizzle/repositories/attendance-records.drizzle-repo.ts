import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import {
  sessionDefs,
  staffAttendanceRecords,
} from '../../../../../database/schema';
import {
  ATTENDANCE_STATUS,
  CANONICAL_CLINIC_LOCATION,
} from '../../../domain/constants/attendance.constants';
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
    checkInAt?: string | null;
    lateMinutes?: number | null;
    recordedMethod: string;
    locationLabel?: string | null;
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
        locationLabel: data.locationLabel ?? CANONICAL_CLINIC_LOCATION,
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
          locationLabel: data.locationLabel ?? CANONICAL_CLINIC_LOCATION,
          sessionId: data.sessionId,
          qrSessionId: data.qrSessionId || undefined,
          isReplacement: data.isReplacement,
          replacementOpportunityId: data.replacementOpportunityId,
          recordedBy: data.recordedBy,
          notes: data.notes,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    return this.attachShiftLabel(record);
  }

  async updateAttendanceRecord(
    id: string,
    data: {
      checkOutAt?: string | null;
      validatedDurationHours?: string | null;
      notes?: string | null;
      isEarlyDeparture?: boolean;
      recordedBy?: string | null;
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
    if (data.recordedBy !== undefined) {
      updateValues.recordedBy = data.recordedBy;
    }

    const [updated] = await this.db
      .update(staffAttendanceRecords)
      .set(updateValues)
      .where(eq(staffAttendanceRecords.id, id))
      .returning();

    return this.attachShiftLabel(updated);
  }

  async findById(id: string): Promise<AttendanceEntity | null> {
    const [record] = await this.db
      .select()
      .from(staffAttendanceRecords)
      .where(eq(staffAttendanceRecords.id, id))
      .limit(1);

    return record ? this.attachShiftLabel(record) : null;
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

    return records.length > 0 ? this.attachShiftLabel(records[0]) : null;
  }

  async findAttendanceRecordsForStaffAndDate(
    staffId: string,
    attendanceDate: string,
  ): Promise<AttendanceEntity[]> {
    const [records, allSessionDefs] = await Promise.all([
      this.db
        .select()
        .from(staffAttendanceRecords)
        .where(
          and(
            eq(staffAttendanceRecords.staffProfileId, staffId),
            eq(staffAttendanceRecords.attendanceDate, attendanceDate),
          ),
        ),
      this.db
        .select({
          id: sessionDefs.id,
          code: sessionDefs.code,
          label: sessionDefs.label,
        })
        .from(sessionDefs),
    ]);

    const sessionLabelMap = new Map<string, string>();
    for (const def of allSessionDefs) {
      if (def.code && def.label) sessionLabelMap.set(def.code, def.label);
      if (def.id && def.label) sessionLabelMap.set(def.id, def.label);
    }

    return records.map((r) =>
      AttendanceMapper.toAttendanceEntity({
        ...r,
        shiftLabel:
          (r.sessionId && sessionLabelMap.get(r.sessionId)) ||
          (r.shift && sessionLabelMap.get(r.shift)) ||
          null,
      }),
    );
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

    return records.length > 0 ? this.attachShiftLabel(records[0]) : null;
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

    return records.length > 0 ? this.attachShiftLabel(records[0]) : null;
  }

  private async attachShiftLabel(record: any): Promise<AttendanceEntity> {
    let shiftLabel: string | null = null;
    if (record.sessionId) {
      const def = await this.db
        .select({ label: sessionDefs.label })
        .from(sessionDefs)
        .where(eq(sessionDefs.id, record.sessionId))
        .limit(1);
      shiftLabel = def[0]?.label ?? null;
    } else if (record.shift) {
      const def = await this.db
        .select({ label: sessionDefs.label })
        .from(sessionDefs)
        .where(eq(sessionDefs.code, record.shift))
        .limit(1);
      shiftLabel = def[0]?.label ?? null;
    }

    return AttendanceMapper.toAttendanceEntity({
      ...record,
      shiftLabel,
    });
  }

  async findByStaffId(
    staffId: string,
    limit: number = 30,
  ): Promise<AttendanceEntity[]> {
    const [records, allSessionDefs] = await Promise.all([
      this.db.query.staffAttendanceRecords.findMany({
        where: eq(staffAttendanceRecords.staffProfileId, staffId),
        orderBy: [desc(staffAttendanceRecords.attendanceDate)],
        limit,
      }),
      this.db
        .select({
          id: sessionDefs.id,
          code: sessionDefs.code,
          label: sessionDefs.label,
        })
        .from(sessionDefs),
    ]);

    const sessionLabelMap = new Map<string, string>();
    for (const def of allSessionDefs) {
      if (def.code && def.label) sessionLabelMap.set(def.code, def.label);
      if (def.id && def.label) sessionLabelMap.set(def.id, def.label);
    }

    return records.map((r: any) =>
      AttendanceMapper.toAttendanceEntity({
        ...r,
        shiftLabel:
          (r.sessionId && sessionLabelMap.get(r.sessionId)) ||
          (r.shift && sessionLabelMap.get(r.shift)) ||
          null,
      }),
    );
  }

  async findHistoryWithSummaryByStaffId(
    staffId: string,
    limit: number = 30,
  ): Promise<AttendanceHistoryResultDto> {
    const [records, allSessionDefs] = await Promise.all([
      this.db.query.staffAttendanceRecords.findMany({
        where: eq(staffAttendanceRecords.staffProfileId, staffId),
        orderBy: [desc(staffAttendanceRecords.attendanceDate)],
        limit,
      }),
      this.db
        .select({
          id: sessionDefs.id,
          code: sessionDefs.code,
          label: sessionDefs.label,
        })
        .from(sessionDefs),
    ]);

    const sessionLabelMap = new Map<string, string>();
    for (const def of allSessionDefs) {
      if (def.code && def.label) sessionLabelMap.set(def.code, def.label);
      if (def.id && def.label) sessionLabelMap.set(def.id, def.label);
    }

    const entities = records.map((r: any) =>
      AttendanceMapper.toAttendanceEntity({
        ...r,
        shiftLabel:
          (r.sessionId && sessionLabelMap.get(r.sessionId)) ||
          (r.shift && sessionLabelMap.get(r.shift)) ||
          null,
      }),
    );

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
        if (!Number.isNaN(val)) totalWorkHours += val;
      }
      const st = (r.status || '').toLowerCase();
      if (st === ATTENDANCE_STATUS.PRESENT) {
        hadirCount++;
      } else if (st === ATTENDANCE_STATUS.LATE) {
        telatCount++;
      } else if (st === ATTENDANCE_STATUS.LEAVE) {
        cutiCount++;
      } else if (
        st === ATTENDANCE_STATUS.ABSENT ||
        st === ATTENDANCE_STATUS.MISSED
      ) {
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
          {
            status: 'hadir',
            label: 'Hadir',
            count: hadirCount,
            color: '#10B981',
          },
          {
            status: 'telat',
            label: 'Telat',
            count: telatCount,
            color: '#F59E0B',
          },
          {
            status: 'missed',
            label: 'Missed',
            count: missedCount,
            color: '#EF4444',
          },
          { status: 'cuti', label: 'Cuti', count: cutiCount, color: '#8B5CF6' },
        ],
      },
    };
  }

  async findDailyWithStaff(date: string): Promise<any[]> {
    return this.db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.attendanceDate, date),
      with: {
        staffProfile: {
          with: {
            role: true,
          },
        },
        replacementOpportunity: {
          with: {
            originalStaffProfile: true,
          },
        },
      },
      orderBy: [desc(staffAttendanceRecords.checkInAt)],
    });
  }
}

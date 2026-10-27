import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import {
  masterDays,
  medicalSpecialties,
  practitioners,
  sessionDefs,
  staffAttendanceRecords,
  staffProfiles,
} from '../../../../../database/schema';
import {
  CATEGORY_LABEL_MAP,
  SHIFT_LABEL_MAP,
  STATUS_LABEL_MAP,
  ShiftCode,
} from '../../../domain/constants/attendance.constants';
import { AttendanceExportCandidate } from '../../../domain/repositories/attendance.repository';

@Injectable()
export class AttendanceBffStatsDrizzleRepo {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async getMasterDays(): Promise<Array<{
    dow: number;
    code: string;
    nameId: string;
    shortNameId: string;
    sortOrder: number;
  }>> {
    const rows = await this.db
      .select({
        dow: masterDays.dow,
        code: masterDays.code,
        nameId: masterDays.nameId,
        shortNameId: masterDays.shortNameId,
        sortOrder: masterDays.sortOrder,
      })
      .from(masterDays)
      .where(eq(masterDays.isActive, true))
      .orderBy(masterDays.sortOrder);

    return rows;
  }

  async findWeeklyAttendanceCounts(
    startDate: string,
    endDate: string,
  ): Promise<Map<string, { presentCount: number; lateCount: number }>> {
    const records = await this.db
      .select({
        attendanceDate: staffAttendanceRecords.attendanceDate,
        status: staffAttendanceRecords.status,
      })
      .from(staffAttendanceRecords)
      .where(
        and(
          gte(staffAttendanceRecords.attendanceDate, startDate),
          lte(staffAttendanceRecords.attendanceDate, endDate),
        ),
      );

    const map = new Map<string, { presentCount: number; lateCount: number }>();
    for (const r of records) {
      const entry = map.get(r.attendanceDate) || {
        presentCount: 0,
        lateCount: 0,
      };
      if (r.status === 'present') entry.presentCount++;
      else if (r.status === 'late') entry.lateCount++;
      map.set(r.attendanceDate, entry);
    }

    return map;
  }

  async getAvailableFilterOptions(): Promise<{
    shifts: Array<{ label: string; value: string }>;
    statuses: Array<{ label: string; value: string }>;
    categories: Array<{ label: string; value: string }>;
  }> {
    // 1. Database-driven active shifts from session_def
    const activeSessions = await this.db
      .select({
        code: sessionDefs.code,
        labelKey: sessionDefs.labelKey,
        sortOrder: sessionDefs.sortOrder,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.isActive, true))
      .orderBy(sessionDefs.sortOrder);

    const shifts = activeSessions.map((s: any) => ({
      label: SHIFT_LABEL_MAP[s.code as ShiftCode] ?? s.code,
      value: s.code,
    }));

    // 2. Database-driven distinct staff categories from staff_profiles
    const staffTypeRows = await this.db
      .selectDistinct({ staffType: staffProfiles.staffType })
      .from(staffProfiles);

    const categories = staffTypeRows.map((r: any) => ({
      label: CATEGORY_LABEL_MAP[r.staffType] ?? r.staffType,
      value: r.staffType,
    }));

    // 3. Database & System-driven canonical attendance statuses
    const statuses = [
      { label: STATUS_LABEL_MAP.present, value: 'present' },
      { label: STATUS_LABEL_MAP.late, value: 'late' },
      { label: STATUS_LABEL_MAP.leave, value: 'leave' },
      { label: STATUS_LABEL_MAP.absent, value: 'absent' },
    ];

    return { shifts, statuses, categories };
  }

  async getExportCandidates(
    startDate: string,
    endDate: string,
  ): Promise<AttendanceExportCandidate[]> {
    const rows = await this.db
      .select({
        id: staffProfiles.id,
        staffCode: staffProfiles.staffCode,
        fullName: staffProfiles.fullName,
        avatarUrl: staffProfiles.avatarUrl,
        staffType: staffProfiles.staffType,
        positionTitle: staffProfiles.positionTitle,
        specialtyName: medicalSpecialties.name,
        totalAttendance: sql<number>`COALESCE(COUNT(DISTINCT ${staffAttendanceRecords.attendanceDate}), 0)::int`,
      })
      .from(staffProfiles)
      .leftJoin(practitioners, eq(practitioners.staffProfileId, staffProfiles.id))
      .leftJoin(medicalSpecialties, eq(medicalSpecialties.id, practitioners.specialtyId))
      .leftJoin(
        staffAttendanceRecords,
        and(
          eq(staffAttendanceRecords.staffProfileId, staffProfiles.id),
          gte(staffAttendanceRecords.attendanceDate, startDate),
          lte(staffAttendanceRecords.attendanceDate, endDate),
        ),
      )
      .where(eq(staffProfiles.status, 'active'))
      .groupBy(
        staffProfiles.id,
        staffProfiles.staffCode,
        staffProfiles.fullName,
        staffProfiles.avatarUrl,
        staffProfiles.staffType,
        staffProfiles.positionTitle,
        medicalSpecialties.name,
      )
      .orderBy(asc(staffProfiles.fullName));

    return rows.map((r: any) => ({
      id: r.id,
      staffCode: r.staffCode,
      fullName: r.fullName,
      avatarUrl: r.avatarUrl,
      staffType: r.staffType,
      positionTitle: r.positionTitle,
      specialtyName: r.specialtyName,
      totalAttendance: Number(r.totalAttendance) || 0,
    }));
  }
}

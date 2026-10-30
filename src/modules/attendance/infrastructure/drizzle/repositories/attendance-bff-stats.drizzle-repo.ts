import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lte, not, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import {
  masterDays,
  medicalSpecialties,
  practitioners,
  roles,
  sessionDefs,
  staffAttendanceRecords,
  staffProfiles,
} from '../../../../../database/schema';
import {
  ATTENDANCE_STATUSES,
} from '../../../domain/constants/attendance.constants';
import { ROLE_AUDIENCE } from '../../../../../common/constants/role-audience.constants';
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
    roles: Array<{ label: string; value: string; id: string; code: string; isClinical: boolean }>;
  }> {
    // 1. Database-driven active shifts from session_def
    const activeSessions = await this.db
      .select({
        code: sessionDefs.code,
        label: sessionDefs.label,
        sortOrder: sessionDefs.sortOrder,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.isActive, true))
      .orderBy(sessionDefs.sortOrder);

    const shifts = activeSessions.map((s: any) => ({
      label: s.label || s.code,
      value: s.code,
    }));

    // 2. Database-driven distinct staff roles from roles table (audience = 'internal')
    const staffRoles = await this.db
      .select({
        id: roles.id,
        code: roles.code,
        name: roles.name,
        isClinical: roles.isClinical,
      })
      .from(roles)
      .where(eq(roles.audience, ROLE_AUDIENCE.INTERNAL));

    const rolesList = staffRoles.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.name,
      value: r.id,
      isClinical: r.isClinical,
    }));

    const categories = staffRoles.map((r) => ({
      label: r.name,
      value: r.code,
    }));

    // 3. Database & System-driven canonical attendance statuses
    const statuses = ATTENDANCE_STATUSES.map((st) => ({
      label: st,
      value: st,
    }));

    return { shifts, statuses, categories, roles: rolesList };
  }

  async getAllShiftLabelsMap(): Promise<Map<string, string>> {
    const allSessions = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        label: sessionDefs.label,
      })
      .from(sessionDefs);

    const map = new Map<string, string>();
    for (const s of allSessions) {
      if (s.label) {
        map.set(s.code, s.label);
        map.set(s.id, s.label);
      }
    }
    return map;
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
        roleId: roles.id,
        roleCode: roles.code,
        roleName: roles.name,
        isClinical: roles.isClinical,
        positionTitle: staffProfiles.positionTitle,
        specialtyName: medicalSpecialties.name,
        totalAttendance: sql<number>`COALESCE(COUNT(DISTINCT ${staffAttendanceRecords.attendanceDate}), 0)::int`,
      })
      .from(staffProfiles)
      .leftJoin(roles, eq(roles.id, staffProfiles.roleId))
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
        roles.id,
        roles.code,
        roles.name,
        roles.isClinical,
        staffProfiles.positionTitle,
        medicalSpecialties.name,
      )
      .orderBy(asc(staffProfiles.fullName));

    return rows.map((r: any) => ({
      id: r.id,
      staffCode: r.staffCode,
      fullName: r.fullName,
      avatarUrl: r.avatarUrl,
      roleId: r.roleId || null,
      roleCode: r.roleCode || null,
      roleName: r.roleName || null,
      isClinical: Boolean(r.isClinical),
      positionTitle: r.positionTitle || null,
      specialtyName: r.specialtyName || null,
      totalAttendance: r.totalAttendance,
    }));
  }
}

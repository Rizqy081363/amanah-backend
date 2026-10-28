import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { isUUID } from 'class-validator';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  practitioners,
  sessionDefs,
  sessionSchedules,
  shiftExceptions,
  staffLeaveRequests,
  staffProfiles,
  staffRosters,
} from '../../../../../database/schema';
import { replacementOpportunities } from '../../../../../database/schema/leave-payroll.schema';

@Injectable()
export class AttendanceRosterLookupDrizzleRepo {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async findApprovedLeave(staffId: string, dateStr: string): Promise<boolean> {
    const onLeave = await this.db
      .select({ id: staffLeaveRequests.id })
      .from(staffLeaveRequests)
      .where(
        and(
          eq(staffLeaveRequests.staffProfileId, staffId),
          eq(staffLeaveRequests.status, 'approved'),
          lte(staffLeaveRequests.startDate, dateStr),
          gte(staffLeaveRequests.endDate, dateStr),
        ),
      )
      .limit(1);

    return onLeave.length > 0;
  }

  async findClaimedReplacement(
    staffId: string,
    dateStr: string,
  ): Promise<{ id: string } | null> {
    const claimed = await this.db
      .select({ id: replacementOpportunities.id })
      .from(replacementOpportunities)
      .where(
        and(
          eq(replacementOpportunities.claimedByStaffProfileId, staffId),
          eq(replacementOpportunities.workDate, dateStr),
          eq(replacementOpportunities.status, 'claimed'),
        ),
      )
      .limit(1);

    return claimed.length > 0 ? { id: claimed[0].id } : null;
  }

  async markReplacementCompleted(opportunityId: string): Promise<void> {
    await this.db
      .update(replacementOpportunities)
      .set({
        status: 'completed',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(replacementOpportunities.id, opportunityId));
  }

  async hasCustomStaffRoster(staffId: string): Promise<boolean> {
    const records = await this.db
      .select({ id: staffRosters.id })
      .from(staffRosters)
      .where(eq(staffRosters.staffProfileId, staffId))
      .limit(1);
    return records.length > 0;
  }

  async hasCustomDoctorRoster(staffId: string): Promise<boolean> {
    const records = await this.db
      .select({ id: doctorAssignments.id })
      .from(doctorAssignments)
      .innerJoin(
        practitioners,
        eq(doctorAssignments.doctorId, practitioners.id),
      )
      .where(
        and(
          eq(practitioners.staffProfileId, staffId),
          eq(doctorAssignments.isActive, true),
        ),
      )
      .limit(1);

    return records.length > 0;
  }

  async findInactiveDoctorAssignmentSessionIds(
    staffId: string,
    dow: number,
  ): Promise<string[]> {
    const rows = await this.db
      .select({ sessionId: doctorAssignments.sessionId })
      .from(doctorAssignments)
      .innerJoin(
        practitioners,
        eq(doctorAssignments.doctorId, practitioners.id),
      )
      .where(
        and(
          eq(practitioners.staffProfileId, staffId),
          eq(doctorAssignments.isActive, false),
          or(
            eq(doctorAssignments.dow, dow),
            sql`${doctorAssignments.dow} IS NULL`,
          ),
        ),
      );

    return rows.map((r) => r.sessionId);
  }

  async findStaffRostersForDow(
    staffId: string,
    dow: number,
  ): Promise<Array<{ id: string; sessionId: string }>> {
    return this.db
      .select({
        id: staffRosters.id,
        sessionId: staffRosters.sessionId,
      })
      .from(staffRosters)
      .where(
        and(
          eq(staffRosters.staffProfileId, staffId),
          eq(staffRosters.dow, dow),
          eq(staffRosters.isActive, true),
        ),
      );
  }

  async findStaffRostersForDowDetailed(
    staffId: string,
    dow: number,
  ): Promise<
    Array<{
      id: string;
      sessionId: string;
      shift: string;
      startsAt: string | null;
      endsAt: string | null;
    }>
  > {
    return this.db
      .select({
        id: staffRosters.id,
        sessionId: staffRosters.sessionId,
        shift: sessionDefs.code,
        startsAt: sql<string | null>`COALESCE(${sessionSchedules.startsAt}, ${sessionDefs.defaultStartsAt})`,
        endsAt: sql<string | null>`COALESCE(${sessionSchedules.endsAt}, ${sessionDefs.defaultEndsAt})`,
      })
      .from(staffRosters)
      .innerJoin(sessionDefs, eq(staffRosters.sessionId, sessionDefs.id))
      .leftJoin(
        sessionSchedules,
        and(
          eq(sessionSchedules.sessionId, staffRosters.sessionId),
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
        ),
      )
      .where(
        and(
          eq(staffRosters.staffProfileId, staffId),
          eq(staffRosters.dow, dow),
          eq(staffRosters.isActive, true),
          eq(sessionDefs.isActive, true),
        ),
      );
  }

  async findDoctorAssignmentsForDowDetailed(
    staffId: string,
    dow: number,
  ): Promise<
    Array<{
      id: string;
      sessionId: string;
      shift: string;
      startsAt: string | null;
      endsAt: string | null;
    }>
  > {
    return this.db
      .select({
        id: doctorAssignments.id,
        sessionId: doctorAssignments.sessionId,
        shift: sessionDefs.code,
        startsAt: sql<string | null>`COALESCE(${sessionSchedules.startsAt}, ${sessionDefs.defaultStartsAt})`,
        endsAt: sql<string | null>`COALESCE(${sessionSchedules.endsAt}, ${sessionDefs.defaultEndsAt})`,
      })
      .from(doctorAssignments)
      .innerJoin(
        practitioners,
        eq(doctorAssignments.doctorId, practitioners.id),
      )
      .innerJoin(sessionDefs, eq(doctorAssignments.sessionId, sessionDefs.id))
      .leftJoin(
        sessionSchedules,
        and(
          eq(sessionSchedules.sessionId, doctorAssignments.sessionId),
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
        ),
      )
      .where(
        and(
          eq(practitioners.staffProfileId, staffId),
          eq(doctorAssignments.isActive, true),
          eq(sessionDefs.isActive, true),
          or(
            eq(doctorAssignments.dow, dow),
            and(
              sql`${doctorAssignments.dow} IS NULL`,
              sql`${sessionSchedules.id} IS NOT NULL`,
            ),
          ),
        ),
      );
  }

  async findDoctorShiftExceptions(
    staffId: string,
    dateStr: string,
  ): Promise<
    Array<{
      id: string;
      sessionId: string | null;
      type: string;
      note: string | null;
      shift: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
    }>
  > {
    const prac = await this.db
      .select({ id: practitioners.id })
      .from(practitioners)
      .where(eq(practitioners.staffProfileId, staffId))
      .limit(1);

    if (prac.length === 0) return [];

    return this.db
      .select({
        id: shiftExceptions.id,
        sessionId: shiftExceptions.sessionId,
        type: shiftExceptions.type,
        note: shiftExceptions.note,
        shift: sessionDefs.code,
        startsAt: sessionDefs.defaultStartsAt,
        endsAt: sessionDefs.defaultEndsAt,
      })
      .from(shiftExceptions)
      .leftJoin(sessionDefs, eq(shiftExceptions.sessionId, sessionDefs.id))
      .where(
        and(
          eq(shiftExceptions.doctorId, prac[0].id),
          eq(shiftExceptions.serviceDate, dateStr),
        ),
      );
  }

  async findClinicWeeklyTemplateForDow(
    dow: number,
  ): Promise<
    Array<{
      id: string;
      sessionId: string;
      shift: string;
      startsAt: string | null;
      endsAt: string | null;
    }>
  > {
    return this.db
      .select({
        id: sessionSchedules.id,
        sessionId: sessionSchedules.sessionId,
        shift: sessionDefs.code,
        startsAt: sql<string | null>`COALESCE(${sessionSchedules.startsAt}, ${sessionDefs.defaultStartsAt})`,
        endsAt: sql<string | null>`COALESCE(${sessionSchedules.endsAt}, ${sessionDefs.defaultEndsAt})`,
      })
      .from(sessionSchedules)
      .innerJoin(sessionDefs, eq(sessionSchedules.sessionId, sessionDefs.id))
      .where(
        and(
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
          eq(sessionDefs.isActive, true),
        ),
      );
  }

  async findClaimedReplacementSession(
    opportunityId: string,
    dow: number,
  ): Promise<{
    id: string;
    sessionId: string;
    shift: string;
    startsAt: string | null;
    endsAt: string | null;
    originalStaffName?: string | null;
    originalStaffCode?: string | null;
  } | null> {
    const records = await this.db
      .select({
        id: replacementOpportunities.id,
        sessionId: replacementOpportunities.sessionId,
        shift: sessionDefs.code,
        startsAt: sql<string | null>`COALESCE(${sessionSchedules.startsAt}, ${sessionDefs.defaultStartsAt})`,
        endsAt: sql<string | null>`COALESCE(${sessionSchedules.endsAt}, ${sessionDefs.defaultEndsAt})`,
        originalStaffName: staffProfiles.fullName,
        originalStaffCode: staffProfiles.staffCode,
      })
      .from(replacementOpportunities)
      .innerJoin(
        sessionDefs,
        eq(replacementOpportunities.sessionId, sessionDefs.id),
      )
      .innerJoin(
        staffProfiles,
        eq(replacementOpportunities.originalStaffProfileId, staffProfiles.id),
      )
      .leftJoin(
        sessionSchedules,
        and(
          eq(sessionSchedules.sessionId, sessionDefs.id),
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
        ),
      )
      .where(eq(replacementOpportunities.id, opportunityId))
      .limit(1);

    return records.length > 0 ? records[0] : null;
  }

  async findDoctorAssignmentsForDow(
    staffId: string,
    dow: number,
  ): Promise<Array<{ id: string; sessionId: string }>> {
    return this.db
      .select({
        id: doctorAssignments.id,
        sessionId: doctorAssignments.sessionId,
      })
      .from(doctorAssignments)
      .innerJoin(
        practitioners,
        eq(doctorAssignments.doctorId, practitioners.id),
      )
      .leftJoin(
        sessionSchedules,
        and(
          eq(sessionSchedules.sessionId, doctorAssignments.sessionId),
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
        ),
      )
      .where(
        and(
          eq(practitioners.staffProfileId, staffId),
          eq(doctorAssignments.isActive, true),
          or(
            eq(doctorAssignments.dow, dow),
            and(
              sql`${doctorAssignments.dow} IS NULL`,
              sql`${sessionSchedules.id} IS NOT NULL`,
            ),
          ),
        ),
      );
  }

  async findScheduledStaffCountByDow(dow: number): Promise<number> {
    // 1. Check if the clinic operates any active session on this day of week
    const activeClinicSessions = await this.db
      .select({ id: sessionSchedules.id })
      .from(sessionSchedules)
      .innerJoin(sessionDefs, eq(sessionSchedules.sessionId, sessionDefs.id))
      .where(
        and(
          eq(sessionSchedules.dow, dow),
          eq(sessionSchedules.isActive, true),
          eq(sessionDefs.isActive, true),
        ),
      )
      .limit(1);

    if (activeClinicSessions.length === 0) {
      // Clinic is closed on this DOW
      return 0;
    }

    // 2. Fetch all active staff profiles
    const allActiveStaff = await this.db
      .select({
        id: staffProfiles.id,
        practitionerId: practitioners.id,
      })
      .from(staffProfiles)
      .leftJoin(
        practitioners,
        eq(practitioners.staffProfileId, staffProfiles.id),
      )
      .where(eq(staffProfiles.status, 'active'));

    if (allActiveStaff.length === 0) {
      return 0;
    }

    // 3. Fetch custom overrides for staff and doctors
    const [staffOverrides, doctorOverrides] = await Promise.all([
      this.db
        .select({
          staffProfileId: staffRosters.staffProfileId,
          dow: staffRosters.dow,
          isActive: staffRosters.isActive,
        })
        .from(staffRosters)
        .innerJoin(sessionDefs, eq(staffRosters.sessionId, sessionDefs.id))
        .where(eq(sessionDefs.isActive, true)),
      this.db
        .select({
          staffProfileId: practitioners.staffProfileId,
          dow: doctorAssignments.dow,
          isActive: doctorAssignments.isActive,
        })
        .from(doctorAssignments)
        .innerJoin(
          practitioners,
          eq(doctorAssignments.doctorId, practitioners.id),
        )
        .innerJoin(sessionDefs, eq(doctorAssignments.sessionId, sessionDefs.id))
        .where(
          and(
            eq(sessionDefs.isActive, true),
            eq(doctorAssignments.isActive, true),
          ),
        ),
    ]);

    // Group overrides by staffProfileId
    const staffWithCustomRoster = new Set<string>();
    const staffScheduledOnDow = new Set<string>();

    for (const r of staffOverrides) {
      staffWithCustomRoster.add(r.staffProfileId);
      if (r.dow === dow && r.isActive) {
        staffScheduledOnDow.add(r.staffProfileId);
      }
    }

    const doctorsWithExplicitRoster = new Set<string>();
    const doctorsScheduledOnDow = new Set<string>();

    for (const d of doctorOverrides) {
      if (!d.staffProfileId) continue;
      if (d.dow !== null) {
        doctorsWithExplicitRoster.add(d.staffProfileId);
        if (d.dow === dow && d.isActive) {
          doctorsScheduledOnDow.add(d.staffProfileId);
        }
      }
    }

    const scheduledStaffIds = new Set<string>();

    for (const staff of allActiveStaff) {
      if (staff.practitionerId) {
        // Doctor: check explicit roster override
        if (doctorsWithExplicitRoster.has(staff.id)) {
          if (doctorsScheduledOnDow.has(staff.id)) {
            scheduledStaffIds.add(staff.id);
          }
        } else {
          // No explicit override: doctor inherits clinic weekly template
          scheduledStaffIds.add(staff.id);
        }
      } else {
        // Regular staff: check staff_rosters override
        if (staffWithCustomRoster.has(staff.id)) {
          if (staffScheduledOnDow.has(staff.id)) {
            scheduledStaffIds.add(staff.id);
          }
        } else {
          // No explicit override: staff inherits clinic weekly template
          scheduledStaffIds.add(staff.id);
        }
      }
    }

    return scheduledStaffIds.size;
  }

  async resolveStaffByIdOrCode(
    query: string,
  ): Promise<{
    id: string;
    staffCode: string;
    fullName: string;
    userId: string | null;
    staffType?: string | null;
    positionTitle?: string | null;
    avatarUrl?: string | null;
    practitionerId?: string | null;
  } | null> {
    const q = query.trim();
    const profiles = await this.db
      .select({
        id: staffProfiles.id,
        staffCode: staffProfiles.staffCode,
        fullName: staffProfiles.fullName,
        userId: staffProfiles.userId,
        staffType: staffProfiles.staffType,
        positionTitle: staffProfiles.positionTitle,
        avatarUrl: staffProfiles.avatarUrl,
        practitionerId: practitioners.id,
      })
      .from(staffProfiles)
      .leftJoin(
        practitioners,
        eq(practitioners.staffProfileId, staffProfiles.id),
      )
      .where(
        isUUID(q)
          ? or(
              eq(staffProfiles.id, q),
              ilike(staffProfiles.staffCode, q),
              ilike(staffProfiles.fullName, q),
            )
          : or(
              ilike(staffProfiles.staffCode, q),
              ilike(staffProfiles.fullName, q),
            ),
      )
      .limit(1);

    return profiles.length > 0 ? profiles[0] : null;
  }

  async resolveSessionDefByTime(
    hourOrTime: number | string | Date,
    windowMinutesBefore = 30,
  ): Promise<{ id: string; code: string; defaultStartsAt: string | null; defaultEndsAt?: string | null } | null> {
    let timeStr: string;
    if (hourOrTime instanceof Date) {
      const h = String(hourOrTime.getHours()).padStart(2, '0');
      const m = String(hourOrTime.getMinutes()).padStart(2, '0');
      const s = String(hourOrTime.getSeconds()).padStart(2, '0');
      timeStr = `${h}:${m}:${s}`;
    } else if (typeof hourOrTime === 'number') {
      timeStr = `${hourOrTime.toString().padStart(2, '0')}:00:00`;
    } else {
      timeStr = hourOrTime.trim();
      if (timeStr.length === 5) {
        timeStr = `${timeStr}:00`;
      }
    }

    const safeMinutes = Math.max(0, Number(windowMinutesBefore) || 0);
    const bufferInterval = `${safeMinutes} minutes`;

    const defs = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        defaultStartsAt: sessionDefs.defaultStartsAt,
        defaultEndsAt: sessionDefs.defaultEndsAt,
      })
      .from(sessionDefs)
      .where(
        and(
          eq(sessionDefs.isActive, true),
          sql`CASE 
            WHEN (${sessionDefs.defaultStartsAt} - (${bufferInterval})::interval) > ${sessionDefs.defaultStartsAt} THEN 
              (${timeStr}::time >= (${sessionDefs.defaultStartsAt} - (${bufferInterval})::interval) OR ${timeStr}::time <= ${sessionDefs.defaultEndsAt})
            WHEN ${sessionDefs.defaultStartsAt} > ${sessionDefs.defaultEndsAt} THEN 
              (${timeStr}::time >= (${sessionDefs.defaultStartsAt} - (${bufferInterval})::interval) OR ${timeStr}::time <= ${sessionDefs.defaultEndsAt})
            ELSE 
              (${timeStr}::time >= (${sessionDefs.defaultStartsAt} - (${bufferInterval})::interval) AND ${timeStr}::time <= ${sessionDefs.defaultEndsAt})
          END`,
        ),
      )
      .orderBy(sessionDefs.sortOrder)
      .limit(1);

    if (defs.length > 0) {
      return defs[0];
    }

    // Zero fabricated fallback. Honest null return when no session is active.
    return null;
  }

  async resolveSessionDefByCode(
    sessionCode: string,
  ): Promise<{ id: string; code: string; defaultStartsAt: string | null; defaultEndsAt?: string | null } | null> {
    const defs = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        defaultStartsAt: sessionDefs.defaultStartsAt,
        defaultEndsAt: sessionDefs.defaultEndsAt,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.code, sessionCode))
      .limit(1);

    return defs.length > 0 ? defs[0] : null;
  }

  async resolveSessionDefById(
    sessionId: string,
  ): Promise<{ id: string; code: string; defaultStartsAt: string | null; defaultEndsAt?: string | null } | null> {
    const defs = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        defaultStartsAt: sessionDefs.defaultStartsAt,
        defaultEndsAt: sessionDefs.defaultEndsAt,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.id, sessionId))
      .limit(1);

    return defs.length > 0 ? defs[0] : null;
  }
}

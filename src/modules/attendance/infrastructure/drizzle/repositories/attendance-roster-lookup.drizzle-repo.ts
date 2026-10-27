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
    const [doctorRosterStaff, regularStaffRoster] = await Promise.all([
      this.db
        .selectDistinct({ staffProfileId: practitioners.staffProfileId })
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
            eq(doctorAssignments.isActive, true),
            or(
              eq(doctorAssignments.dow, dow),
              and(
                sql`${doctorAssignments.dow} IS NULL`,
                sql`${sessionSchedules.id} IS NOT NULL`,
              ),
            ),
          ),
        ),
      this.db
        .selectDistinct({ staffProfileId: staffRosters.staffProfileId })
        .from(staffRosters)
        .where(
          and(
            eq(staffRosters.dow, dow),
            eq(staffRosters.isActive, true),
          ),
        ),
    ]);

    const scheduledStaffIds = new Set<string>([
      ...doctorRosterStaff.map((d: any) => d.staffProfileId),
      ...regularStaffRoster.map((s: any) => s.staffProfileId),
    ]);

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
      })
      .from(staffProfiles)
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
    hour: number,
  ): Promise<{ id: string; code: string; defaultStartsAt: string | null; defaultEndsAt?: string | null } | null> {
    const sessionCode =
      hour < 6
        ? 'early_morning'
        : hour < 12
          ? 'morning'
          : hour < 18
            ? 'afternoon'
            : 'night';

    return this.resolveSessionDefByCode(sessionCode);
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

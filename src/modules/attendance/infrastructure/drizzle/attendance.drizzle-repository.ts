import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { isUUID } from 'class-validator';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  attendanceQrSessions,
  doctorAssignments,
  masterDays,
  practitioners,
  sessionDefs,
  staffAttendanceRecords,
  staffLeaveRequests,
  staffProfiles,
  staffRosters,
} from '../../../../database/schema';
import { replacementOpportunities } from '../../../../database/schema/leave-payroll.schema';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import { QrSessionEntity } from '../../domain/entities/qr-session.entity';
import { AttendanceRepository } from '../../domain/repositories/attendance.repository';
import { AttendanceMapper } from './mappers/attendance.mapper';

@Injectable()
export class AttendanceDrizzleRepository implements AttendanceRepository {
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
      updatedAt?: string;
    },
  ): Promise<AttendanceEntity> {
    const [updated] = await this.db
      .update(staffAttendanceRecords)
      .set({
        checkOutAt: data.checkOutAt,
        validatedDurationHours: data.validatedDurationHours,
        updatedAt: data.updatedAt || new Date().toISOString(),
      })
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

  async findByStaffId(
    staffId: string,
    limit: number = 30,
  ): Promise<AttendanceEntity[]> {
    const records = await this.db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.staffProfileId, staffId),
      orderBy: [desc(staffAttendanceRecords.attendanceDate)],
      limit,
    });

    return records.map((r) => AttendanceMapper.toAttendanceEntity(r));
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

  async createQrSession(data: {
    codeHash: string;
    sessionType: 'location_check_in' | 'staff_identity';
    shift: string;
    rotationSeconds: number;
    context: string;
    validFrom: string;
    validUntil: string;
    createdBy?: string | null;
  }): Promise<QrSessionEntity> {
    // Invalidate previous active sessions for this sessionType upon rotation
    await this.db
      .update(attendanceQrSessions)
      .set({ isActive: false })
      .where(
        and(
          eq(attendanceQrSessions.sessionType, data.sessionType),
          eq(attendanceQrSessions.isActive, true),
        ),
      );

    const [created] = await this.db
      .insert(attendanceQrSessions)
      .values({
        codeHash: data.codeHash,
        sessionType: data.sessionType,
        shift: data.shift as any,
        rotationSeconds: data.rotationSeconds,
        context: data.context,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isActive: true,
        createdBy: data.createdBy || null,
      })
      .returning();

    return AttendanceMapper.toQrSessionEntity(created);
  }

  async findActiveQrSession(
    sessionType: string = 'location_check_in',
  ): Promise<QrSessionEntity | null> {
    const nowIso = new Date().toISOString();
    const active = await this.db
      .select()
      .from(attendanceQrSessions)
      .where(
        and(
          eq(
            attendanceQrSessions.sessionType,
            sessionType as 'location_check_in' | 'staff_identity',
          ),
          eq(attendanceQrSessions.isActive, true),
          gte(attendanceQrSessions.validUntil, nowIso),
        ),
      )
      .orderBy(desc(attendanceQrSessions.validUntil))
      .limit(1);

    return active.length > 0
      ? AttendanceMapper.toQrSessionEntity(active[0])
      : null;
  }

  async findQrSessionByToken(token: string): Promise<QrSessionEntity | null> {
    const trimmed = token.trim();
    const nowIso = new Date().toISOString();
    const sessions = await this.db
      .select()
      .from(attendanceQrSessions)
      .where(
        and(
          eq(attendanceQrSessions.codeHash, trimmed),
          eq(attendanceQrSessions.isActive, true),
          gte(attendanceQrSessions.validUntil, nowIso),
        ),
      )
      .orderBy(desc(attendanceQrSessions.validUntil))
      .limit(1);

    return sessions.length > 0
      ? AttendanceMapper.toQrSessionEntity(sessions[0])
      : null;
  }

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
      .where(
        and(
          eq(practitioners.staffProfileId, staffId),
          eq(doctorAssignments.dow, dow),
          eq(doctorAssignments.isActive, true),
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
        .where(
          and(
            eq(doctorAssignments.dow, dow),
            eq(doctorAssignments.isActive, true),
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
      ...doctorRosterStaff.map((d) => d.staffProfileId),
      ...regularStaffRoster.map((s) => s.staffProfileId),
    ]);

    return scheduledStaffIds.size;
  }

  async resolveStaffByIdOrCode(
    query: string,
  ): Promise<{ id: string; staffCode: string; fullName: string; userId: string | null } | null> {
    const q = query.trim();
    const profiles = await this.db
      .select({
        id: staffProfiles.id,
        staffCode: staffProfiles.staffCode,
        fullName: staffProfiles.fullName,
        userId: staffProfiles.userId,
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
  ): Promise<{ id: string; code: string; defaultStartsAt: string | null } | null> {
    const sessionCode =
      hour < 6
        ? 'early_morning'
        : hour < 12
          ? 'morning'
          : hour < 18
            ? 'afternoon'
            : 'night';

    const defs = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        defaultStartsAt: sessionDefs.defaultStartsAt,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.code, sessionCode))
      .limit(1);

    return defs.length > 0 ? defs[0] : null;
  }

  async resolveSessionDefById(
    sessionId: string,
  ): Promise<{ id: string; code: string; defaultStartsAt: string | null } | null> {
    const defs = await this.db
      .select({
        id: sessionDefs.id,
        code: sessionDefs.code,
        defaultStartsAt: sessionDefs.defaultStartsAt,
      })
      .from(sessionDefs)
      .where(eq(sessionDefs.id, sessionId))
      .limit(1);

    return defs.length > 0 ? defs[0] : null;
  }

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
}

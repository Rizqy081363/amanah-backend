import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { SYSTEM_ROLES } from '../../../../auth/constants/auth.constants';
import { RedisService } from '../../../../common/redis/redis.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  masterDays,
  practitioners,
  sessionDefs,
  sessionSchedules,
  shiftExceptions,
  staffAttendanceRecords,
  staffLeaveRequests,
  staffLeaveRequestType,
  staffProfiles,
  staffRosters,
} from '../../../../database/schema';
import {
  leavePolicies,
  leaveRequestSessions,
  replacementOpportunities,
} from '../../../../database/schema/leave-payroll.schema';
import { SHIFT_EXCEPTION_TYPE } from '../../../appointments/domain/constants/appointment-lifecycle.constants';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { LeaveEntity } from '../../domain/entities/leave.entity';
import {
  CreateLeaveData,
  LeaveFilterOptions,
  LeaveRepository,
} from '../../domain/repositories/leave.repository';

interface SessionDiagnosticResult {
  eligibleSessions: any[];
  hasRawScheduledSessions: boolean;
  hasElapsedSessions: boolean;
  hasAttendedSessionsToday: boolean;
  isCustomRosterDayOff: boolean;
  isOverriddenByLeaveException: boolean;
}

@Injectable()
export class LeaveDrizzleRepository implements LeaveRepository {
  private readonly logger = new Logger(LeaveDrizzleRepository.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly notificationGateway: NotificationGatewayService,
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    @Inject(RedisService)
    private readonly redisService?: RedisService,
  ) {}

  private async invalidateScheduleCaches(): Promise<void> {
    if (!this.redisService) return;
    try {
      await this.redisService.invalidateTags(
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'booking',
      );
    } catch (err: any) {
      this.logger.warn(
        `Failed to invalidate schedule caches on leave mutation: ${err?.message || err}`,
      );
    }
  }

  private mapRecordToEntity(r: any, sessions?: any[]): LeaveEntity {
    return {
      id: r.id,
      staffId: r.staffProfileId,
      practitionerId: r.practitionerId || null,
      startDate: r.startDate,
      endDate: r.endDate,
      durationDays: r.durationDays || 1,
      reason: r.reason,
      type: r.requestType,
      scope: r.scope || 'full_day',
      decisionSource: r.decisionSource || 'admin',
      substituteStaffId: r.substitutePractitionerId || null,
      documentUrl: null,
      status: r.status,
      approvedBy: r.reviewedBy || null,
      approvalNotes: r.reviewerNotes || null,
      cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null,
      sessions: sessions?.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        sessionCode: s.sessionDef?.code,
        sessionLabel: s.sessionDef?.label,
        workDate: s.workDate,
      })),
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  private async resolveSessionsWithDiagnostics(
    staffProfileId: string,
    date: string,
  ): Promise<SessionDiagnosticResult> {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay(); // 0 (Sun) to 6 (Sat)

    // Check if staff has practitioner record
    const [practitioner] = await this.db
      .select()
      .from(practitioners)
      .where(eq(practitioners.staffProfileId, staffProfileId))
      .limit(1);

    let rawSessions: any[] = [];
    let isCustomRosterDayOff = false;
    let isOverriddenByLeaveException = false;

    if (practitioner) {
      // Doctor / Midwife schedule: check custom assignments vs master weekly template
      const doctorAssignmentsList =
        await this.db.query.doctorAssignments.findMany({
          where: eq(doctorAssignments.doctorId, practitioner.id),
          with: {
            sessionDef: true,
          },
        });

      const hasAnyCustomRoster = doctorAssignmentsList.some(
        (da) => da.dow !== null,
      );

      if (hasAnyCustomRoster) {
        // Specific custom assignment for this day
        const activeToday = doctorAssignmentsList.filter(
          (da) =>
            da.dow === dayOfWeek && da.isActive && da.sessionDef?.isActive,
        );

        if (activeToday.length === 0) {
          isCustomRosterDayOff = true;
        } else {
          rawSessions = activeToday.map((a) => ({
            sessionId: a.sessionId,
            sessionCode: a.sessionDef.code,
            sessionLabel: a.sessionDef.label,
            startsAt: a.sessionDef.defaultStartsAt,
            endsAt: a.sessionDef.defaultEndsAt,
            workDate: date,
          }));
        }
      } else {
        // Virtual Baseline: Doctor has no custom assignments, so they inherit the clinic master weekly template
        const templateSchedules =
          await this.db.query.sessionSchedules.findMany({
            where: and(
              eq(sessionSchedules.dow, dayOfWeek),
              eq(sessionSchedules.isActive, true),
            ),
            with: {
              sessionDef: true,
            },
          });

        rawSessions = templateSchedules
          .filter((ts) => ts.sessionDef && ts.sessionDef.isActive)
          .map((ts) => ({
            sessionId: ts.sessionId,
            sessionCode: ts.sessionDef.code,
            sessionLabel: ts.sessionDef.label,
            startsAt: ts.startsAt || ts.sessionDef.defaultStartsAt,
            endsAt: ts.endsAt || ts.sessionDef.defaultEndsAt,
            workDate: date,
          }));
      }

      // Check shift_exceptions for this practitioner on this date
      const shiftExceptionsList = await this.db.query.shiftExceptions.findMany({
        where: and(
          eq(shiftExceptions.doctorId, practitioner.id),
          eq(shiftExceptions.serviceDate, date),
        ),
      });

      for (const exc of shiftExceptionsList) {
        if (exc.type === SHIFT_EXCEPTION_TYPE.LEAVE) {
          if (exc.sessionId) {
            const idx = rawSessions.findIndex(
              (s) => s.sessionId === exc.sessionId,
            );
            if (idx !== -1) {
              rawSessions.splice(idx, 1);
              isOverriddenByLeaveException = true;
            }
          } else {
            // Whole-day leave override
            if (rawSessions.length > 0) {
              isOverriddenByLeaveException = true;
            }
            rawSessions = [];
          }
        } else if (exc.type === SHIFT_EXCEPTION_TYPE.EXTRA && exc.sessionId) {
          if (!rawSessions.some((s) => s.sessionId === exc.sessionId)) {
            const extraDef = await this.db.query.sessionDefs.findFirst({
              where: eq(sessionDefs.id, exc.sessionId),
            });
            if (extraDef && extraDef.isActive) {
              rawSessions.push({
                sessionId: extraDef.id,
                sessionCode: extraDef.code,
                sessionLabel: extraDef.label,
                startsAt: extraDef.defaultStartsAt,
                endsAt: extraDef.defaultEndsAt,
                workDate: date,
              });
            }
          }
        }
      }
    } else {
      // Operational Worker schedule: check custom roster vs master weekly template
      const allWorkerRosters = await this.db.query.staffRosters.findMany({
        where: eq(staffRosters.staffProfileId, staffProfileId),
        with: {
          sessionDef: true,
        },
      });

      const hasAnyCustomRoster = allWorkerRosters.length > 0;

      if (hasAnyCustomRoster) {
        const activeToday = allWorkerRosters.filter(
          (r) =>
            r.dow === dayOfWeek && r.isActive && r.sessionDef?.isActive,
        );

        if (activeToday.length === 0) {
          isCustomRosterDayOff = true;
        } else {
          rawSessions = activeToday.map((r) => ({
            sessionId: r.sessionId,
            sessionCode: r.sessionDef.code,
            sessionLabel: r.sessionDef.label,
            startsAt: r.sessionDef.defaultStartsAt,
            endsAt: r.sessionDef.defaultEndsAt,
            workDate: date,
          }));
        }
      } else {
        // Virtual Baseline: Worker has no custom roster, inherits master clinic weekly template
        const templateSchedules =
          await this.db.query.sessionSchedules.findMany({
            where: and(
              eq(sessionSchedules.dow, dayOfWeek),
              eq(sessionSchedules.isActive, true),
            ),
            with: {
              sessionDef: true,
            },
          });

        rawSessions = templateSchedules
          .filter((ts) => ts.sessionDef && ts.sessionDef.isActive)
          .map((ts) => ({
            sessionId: ts.sessionId,
            sessionCode: ts.sessionDef.code,
            sessionLabel: ts.sessionDef.label,
            startsAt: ts.startsAt || ts.sessionDef.defaultStartsAt,
            endsAt: ts.endsAt || ts.sessionDef.defaultEndsAt,
            workDate: date,
          }));
      }
    }

    const hasRawScheduledSessions = rawSessions.length > 0;
    const todayStr = this.clinicTimeService.today();
    let hasElapsedSessions = false;
    let hasAttendedSessionsToday = false;
    let eligibleSessions: any[] = [];

    if (date < todayStr) {
      hasElapsedSessions = rawSessions.length > 0;
      eligibleSessions = [];
    } else if (date === todayStr) {
      if (rawSessions.length > 0) {
        const now = new Date();
        const todayAttendances = await this.db
          .select()
          .from(staffAttendanceRecords)
          .where(
            and(
              eq(staffAttendanceRecords.staffProfileId, staffProfileId),
              eq(staffAttendanceRecords.attendanceDate, date),
            ),
          );

        eligibleSessions = rawSessions.filter((s) => {
          const att = todayAttendances.find(
            (a) =>
              a.sessionId === s.sessionId ||
              (a.shift && a.shift.toLowerCase() === s.sessionCode.toLowerCase()),
          );

          // 1. If staff has already checked out from this session, it cannot be requested as leave
          if (att?.checkOutAt) {
            hasAttendedSessionsToday = true;
            return false;
          }

          // 2. If staff has already checked in, mid-shift departure belongs to Attendance (Early Check-Out)
          if (att?.checkInAt) {
            hasAttendedSessionsToday = true;
            return false;
          }

          // 3. If session end time has already elapsed in the past
          if (s.endsAt) {
            let [endH, endM] = s.endsAt.split(':').map(Number);
            if (endH === 24) endH = 0;
            const sessionEndDate = new Date(targetDate);
            sessionEndDate.setHours(endH, endM || 0, 0, 0);
            if (endH === 0) sessionEndDate.setDate(sessionEndDate.getDate() + 1);

            if (now.getTime() > sessionEndDate.getTime()) {
              hasElapsedSessions = true;
              return false;
            }
          }

          return true;
        });
      }
    } else {
      eligibleSessions = [...rawSessions];
    }

    return {
      eligibleSessions,
      hasRawScheduledSessions,
      hasElapsedSessions,
      hasAttendedSessionsToday,
      isCustomRosterDayOff,
      isOverriddenByLeaveException,
    };
  }

  async getEligibleSessions(
    staffProfileId: string,
    date: string,
  ): Promise<any[]> {
    const diagnostics = await this.resolveSessionsWithDiagnostics(
      staffProfileId,
      date,
    );
    return diagnostics.eligibleSessions;
  }

  async create(data: CreateLeaveData): Promise<LeaveEntity> {
    const todayStr = this.clinicTimeService.today();
    if (data.startDate < todayStr) {
      throw new BadRequestException(
        'Tanggal permohonan izin tidak boleh di masa lalu (minimal hari ini)',
      );
    }

    const start = new Date(data.startDate).getTime();
    const end = new Date(data.endDate).getTime();
    const durationDays = Math.max(
      1,
      Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1,
    );

    // Schedule Operability and Active Shift Protection (Read-only pre-flight checks)
    const startDt = new Date(data.startDate);
    const endDt = new Date(data.endDate);
    let totalEligibleSessionsAcrossRange = 0;
    let anyOperatingDayOpen = false;
    let anyElapsedToday = false;
    let anyAttendedToday = false;
    let anyCustomRosterDayOff = false;
    let anyOverriddenByLeaveException = false;

    for (
      let cur = new Date(startDt);
      cur <= endDt;
      cur.setDate(cur.getDate() + 1)
    ) {
      const curDateStr = cur.toISOString().slice(0, 10);
      const curDow = cur.getDay();

      const masterDay = await this.db.query.masterDays.findFirst({
        where: eq(masterDays.dow, curDow),
      });
      if (!masterDay || masterDay.isActive) {
        anyOperatingDayOpen = true;
      }

      const diag = await this.resolveSessionsWithDiagnostics(
        data.staffId,
        curDateStr,
      );
      totalEligibleSessionsAcrossRange += diag.eligibleSessions.length;
      if (diag.hasElapsedSessions) anyElapsedToday = true;
      if (diag.hasAttendedSessionsToday) anyAttendedToday = true;
      if (diag.isCustomRosterDayOff) anyCustomRosterDayOff = true;
      if (diag.isOverriddenByLeaveException) {
        anyOverriddenByLeaveException = true;
      }
    }

    if (!anyOperatingDayOpen) {
      throw new BadRequestException(
        'Klinik tutup pada seluruh tanggal yang dipilih. Tidak dapat mengajukan cuti pada hari libur operasional klinik.',
      );
    }

    if (totalEligibleSessionsAcrossRange === 0) {
      if (anyAttendedToday) {
        throw new BadRequestException(
          'Anda telah melakukan check-in atau menyelesaikan kehadiran pada sesi dinas hari ini. Permohonan izin tidak dapat diajukan untuk sesi yang sudah dihadiri.',
        );
      }
      if (anyElapsedToday) {
        throw new BadRequestException(
          'Shift dinas pada tanggal yang dipilih telah berakhir. Permohonan izin tidak dapat diajukan untuk sesi yang sudah lewat.',
        );
      }
      if (anyOverriddenByLeaveException) {
        throw new BadRequestException(
          'Jadwal dinas pada tanggal yang dipilih telah berstatus cuti atau dinonaktifkan.',
        );
      }
      if (anyCustomRosterDayOff) {
        throw new BadRequestException(
          'Anda tidak memiliki jadwal dinas aktif pada tanggal yang dipilih.',
        );
      }
      throw new BadRequestException(
        'Tidak dapat mengajukan cuti pada jadwal yang tidak aktif atau sudah ditutup.',
      );
    }

    if (data.scope === 'session') {
      if (!data.sessionIds || data.sessionIds.length === 0) {
        throw new BadRequestException(
          'Sesi praktik harus dipilih untuk permohonan izin parsial.',
        );
      }
      const eligibleOnStart = await this.getEligibleSessions(
        data.staffId,
        data.startDate,
      );
      const eligibleSessIds = new Set(eligibleOnStart.map((s) => s.sessionId));
      for (const reqSessId of data.sessionIds) {
        if (!eligibleSessIds.has(reqSessId)) {
          throw new BadRequestException(
            'Sesi yang dipilih sudah ditutup atau tidak aktif dalam jadwal dinas Anda.',
          );
        }
      }
    }

    // Resolve practitionerId if not provided
    let practitionerId = data.practitionerId;
    if (!practitionerId) {
      const [pract] = await this.db
        .select({ id: practitioners.id })
        .from(practitioners)
        .where(eq(practitioners.staffProfileId, data.staffId))
        .limit(1);
      practitionerId = pract?.id || null;
    }

    const reqType = data.type;

    // Transactional Execution & Concurrency Serialization
    const { record, insertedSessions, initialStatus } =
      await this.db.transaction(async (tx) => {
        // 1. Concurrency serialization: lock staff profile row for update
        await tx
          .select({ id: staffProfiles.id })
          .from(staffProfiles)
          .where(eq(staffProfiles.id, data.staffId))
          .for('update');

        // 2. Load active leave policy and determine configuration
        const [policy] = await tx
          .select()
          .from(leavePolicies)
          .where(eq(leavePolicies.isActive, true))
          .orderBy(desc(leavePolicies.effectiveFrom))
          .limit(1);

        const approvalRequired = policy ? policy.approvalRequired : true;
        const initialStatus: 'pending' | 'approved' = approvalRequired
          ? 'pending'
          : 'approved';
        const decisionSource: 'admin' | 'auto' = approvalRequired
          ? 'admin'
          : 'auto';
        const periodPolicy = policy?.periodPolicy || 'non_overlapping';

        // 3. Monthly limit check
        if (policy && policy.limitMode === 'monthly_limit') {
          const [year, month] = data.startDate.split('-').map(Number);
          const lastDay = new Date(year, month, 0).getDate();
          const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
          const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

          const existingInMonth = await tx
            .select({ id: staffLeaveRequests.id })
            .from(staffLeaveRequests)
            .where(
              and(
                eq(staffLeaveRequests.staffProfileId, data.staffId),
                gte(staffLeaveRequests.startDate, monthStart),
                lte(staffLeaveRequests.endDate, monthEnd),
                inArray(staffLeaveRequests.status, ['pending', 'approved']),
              ),
            );

          if (existingInMonth.length >= policy.monthlyLimit) {
            throw new BadRequestException(
              `Batas maksimum cuti bulanan (${policy.monthlyLimit} kali) telah tercapai untuk periode ini`,
            );
          }
        }

        // 4. Strict Mode Protection (Policy B: previous_period_must_finish)
        if (periodPolicy === 'previous_period_must_finish') {
          const activeOrFutureLeaves = await tx.query.staffLeaveRequests.findMany({
            where: and(
              eq(staffLeaveRequests.staffProfileId, data.staffId),
              inArray(staffLeaveRequests.status, ['pending', 'approved']),
              gte(staffLeaveRequests.endDate, todayStr),
            ),
            orderBy: [desc(staffLeaveRequests.endDate)],
          });

          if (activeOrFutureLeaves.length > 0) {
            const latest = activeOrFutureLeaves[0];
            const dateRangeLabel =
              latest.startDate === latest.endDate
                ? latest.startDate
                : `${latest.startDate} s/d ${latest.endDate}`;
            throw new BadRequestException(
              `Kebijakan klinik mewajibkan masa periode cuti sebelumnya (${dateRangeLabel}) selesai terlebih dahulu sebelum dapat mengajukan permohonan izin baru.`,
            );
          }
        }

        // 5. Overlapping Leave Protection (Pending and Approved requests)
        const overlappingRequests = await tx.query.staffLeaveRequests.findMany({
          where: and(
            eq(staffLeaveRequests.staffProfileId, data.staffId),
            inArray(staffLeaveRequests.status, ['pending', 'approved']),
            lte(staffLeaveRequests.startDate, data.endDate),
            gte(staffLeaveRequests.endDate, data.startDate),
          ),
          with: {
            sessions: true,
          },
        });

        for (const existing of overlappingRequests) {
          let isConflicting = false;

          if (existing.scope === 'full_day' || data.scope === 'full_day') {
            // A full_day leave encompasses all shifts, so any date overlap is a conflict
            isConflicting = true;
          } else if (existing.scope === 'session' && data.scope === 'session') {
            // Both are session-scoped on overlapping date(s): conflict if any session is shared
            const newSessionIds = new Set(data.sessionIds || []);
            const existingSessionIds =
              existing.sessions?.map((s) => s.sessionId) || [];
            const hasCommonSession = existingSessionIds.some((id) =>
              newSessionIds.has(id),
            );
            if (hasCommonSession) {
              isConflicting = true;
            }
          }

          if (isConflicting) {
            const statusLabel =
              existing.status === 'pending'
                ? 'menunggu persetujuan (pending)'
                : 'telah disetujui';
            const dateRangeLabel =
              existing.startDate === existing.endDate
                ? existing.startDate
                : `${existing.startDate} s/d ${existing.endDate}`;
            throw new BadRequestException(
              `Anda memiliki permohonan izin yang ${statusLabel} pada rentang tanggal/sesi tersebut (${dateRangeLabel}). Tidak dapat mengajukan permohonan cuti baru yang tumpang tindih.`,
            );
          }
        }

        // 6. Persist leave request
        const [record] = await tx
          .insert(staffLeaveRequests)
          .values({
            staffProfileId: data.staffId,
            practitionerId,
            requestType: reqType,
            startDate: data.startDate,
            endDate: data.endDate,
            durationDays,
            reason: data.reason,
            scope: data.scope || 'full_day',
            decisionSource,
            substitutePractitionerId: data.substituteStaffId || null,
            status: initialStatus,
            reviewedAt:
              initialStatus === 'approved' ? new Date().toISOString() : null,
          })
          .returning();

        // 7. Persist session relations if provided
        const insertedSessions: any[] = [];
        if (data.sessionIds && data.sessionIds.length > 0) {
          for (const sessId of data.sessionIds) {
            const [sessRecord] = await tx
              .insert(leaveRequestSessions)
              .values({
                leaveRequestId: record.id,
                sessionId: sessId,
                workDate: data.startDate,
              })
              .returning();
            insertedSessions.push(sessRecord);
          }
        }

        return { record, insertedSessions, initialStatus };
      });

    // Post-commit side effects (Opportunities, Caches, Notifications)
    if (initialStatus === 'approved') {
      await this.generateReplacementOpportunities(record, insertedSessions);
      await this.invalidateScheduleCaches();
    }

    void this.dispatchLeaveNotification(record, initialStatus);

    return this.mapRecordToEntity(record, insertedSessions);
  }

  private async generateReplacementOpportunities(
    leaveRequest: any,
    sessions: any[],
  ) {
    try {
      if (sessions.length > 0) {
        for (const s of sessions) {
          await this.db
            .insert(replacementOpportunities)
            .values({
              leaveRequestId: leaveRequest.id,
              sessionId: s.sessionId,
              workDate: s.workDate,
              originalStaffProfileId: leaveRequest.staffProfileId,
              originalPractitionerId: leaveRequest.practitionerId || null,
              status: 'open',
            })
            .onConflictDoNothing();
        }
      } else {
        // Full day: query assigned sessions for every date across [startDate..endDate]
        const startDt = new Date(leaveRequest.startDate);
        const endDt = new Date(leaveRequest.endDate);

        for (
          let cur = new Date(startDt);
          cur <= endDt;
          cur.setDate(cur.getDate() + 1)
        ) {
          const curDateStr = cur.toISOString().slice(0, 10);
          const assigned = await this.getEligibleSessions(
            leaveRequest.staffProfileId,
            curDateStr,
          );
          for (const a of assigned) {
            await this.db
              .insert(replacementOpportunities)
              .values({
                leaveRequestId: leaveRequest.id,
                sessionId: a.sessionId,
                workDate: curDateStr,
                originalStaffProfileId: leaveRequest.staffProfileId,
                originalPractitionerId: leaveRequest.practitionerId || null,
                status: 'open',
              })
              .onConflictDoNothing();
          }
        }
      }
    } catch (err) {
      this.logger.error('Failed to generate replacement opportunities', err);
    }
  }

  private async dispatchLeaveNotification(
    record: any,
    status: string,
  ): Promise<void> {
    try {
      // 1. Resolve staff profile info to get userId and fullName
      const [staff] = await this.db
        .select({
          userId: staffProfiles.userId,
          fullName: staffProfiles.fullName,
        })
        .from(staffProfiles)
        .where(eq(staffProfiles.id, record.staffProfileId))
        .limit(1);

      const staffName = staff?.fullName || '';
      const staffUserId = staff?.userId;

      if (status === 'pending') {
        // Staff submitted leave -> notify admin role via in_app & push
        await this.notificationGateway.dispatch({
          commandId: `leave-${record.id}-${Date.now()}`,
          sourceDomain: 'leave',
          target: {
            type: 'role',
            roles: [SYSTEM_ROLES.ADMIN],
          },
          category: 'shift',
          content: {
            title: `Pengajuan Izin Baru: ${staffName}`,
            body: `${staffName} mengajukan permohonan izin (${record.startDate} s/d ${record.endDate}). Alasan: ${record.reason}`,
            actionUrl: `/admin/manajemen-perizinan?leaveId=${record.id}`,
            data: {
              leaveRequestId: record.id,
              staffProfileId: record.staffProfileId,
              staffUserId,
              status,
              type: record.requestType,
            },
          },
          channels: ['in_app', 'push'],
          priority: 'high',
        });

        // Also notify the applicant staff member confirming submission
        if (staffUserId) {
          await this.notificationGateway.dispatch({
            commandId: `leave-ack-${record.id}-${Date.now()}`,
            sourceDomain: 'leave',
            target: {
              type: 'user',
              recipientUserIds: [staffUserId],
            },
            category: 'shift',
            content: {
              title: 'Pengajuan Izin Berhasil Dikirim',
              body: `Permohonan izin Anda (${record.startDate} s/d ${record.endDate}) telah berhasil terkirim dan menunggu persetujuan manajemen.`,
              actionUrl: '/permission',
              data: {
                leaveRequestId: record.id,
                staffProfileId: record.staffProfileId,
                status: 'pending',
                type: record.requestType,
              },
            },
            channels: ['in_app', 'push'],
            priority: 'normal',
          });
        }
      } else if (status === 'approved' || status === 'rejected') {
        // Admin reviewed leave -> notify the specific staff member via in_app & push
        if (staffUserId) {
          const isApproved = status === 'approved';
          await this.notificationGateway.dispatch({
            commandId: `leave-review-${record.id}-${Date.now()}`,
            sourceDomain: 'leave',
            target: {
              type: 'user',
              recipientUserIds: [staffUserId],
            },
            category: 'shift',
            content: {
              title: isApproved
                ? 'Pengajuan Izin Disetujui'
                : 'Pengajuan Izin Ditolak',
              body: `Permohonan izin Anda (${record.startDate} s/d ${record.endDate}) telah ${isApproved ? 'disetujui' : 'ditolak'}.${record.reviewerNotes ? ' Catatan: ' + record.reviewerNotes : ''}`,
              actionUrl: `/permission?leaveId=${record.id}`,
              data: {
                leaveId: record.id,
                leaveRequestId: record.id,
                staffProfileId: record.staffProfileId,
                status,
                reviewerNotes: record.reviewerNotes || null,
              },
            },
            channels: ['in_app', 'push'],
            priority: 'high',
          });
        }
      } else if (status === 'cancelled') {
        // Staff cancelled pending leave -> notify admin
        await this.notificationGateway.dispatch({
          commandId: `leave-cancel-${record.id}-${Date.now()}`,
          sourceDomain: 'leave',
          target: {
            type: 'role',
            roles: [SYSTEM_ROLES.ADMIN],
          },
          category: 'shift',
          content: {
            title: `Pengajuan Izin Dibatalkan: ${staffName}`,
            body: `${staffName} membatalkan pengajuan izin (${record.startDate} s/d ${record.endDate}).`,
            actionUrl: '/admin/manajemen-perizinan',
            data: {
              leaveRequestId: record.id,
              staffProfileId: record.staffProfileId,
              status: 'cancelled',
            },
          },
          channels: ['in_app', 'push'],
          priority: 'normal',
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to dispatch leave notification: ${String(err?.message || err)}`,
      );
    }
  }

  async findByStaffId(staffId: string): Promise<LeaveEntity[]> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      where: eq(staffLeaveRequests.staffProfileId, staffId),
      with: {
        sessions: {
          with: {
            sessionDef: true,
          },
        },
      },
      orderBy: [desc(staffLeaveRequests.createdAt)],
    });

    return records.map((r: any) => this.mapRecordToEntity(r, r.sessions));
  }

  async findAllPending(): Promise<any[]> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      where: eq(staffLeaveRequests.status, 'pending'),
      with: {
        staffProfile: true,
        sessions: {
          with: {
            sessionDef: true,
          },
        },
      },
      orderBy: [desc(staffLeaveRequests.createdAt)],
    });

    return records.map((r: any) => ({
      ...this.mapRecordToEntity(r, r.sessions),
      staff: r.staffProfile
        ? {
            id: r.staffProfile.id,
            fullName: r.staffProfile.fullName,
            profession: r.staffProfile.positionTitle,
            idCardNumber: r.staffProfile.staffCode,
            staffType: r.staffProfile.staffType,
            avatarUrl: r.staffProfile.avatarUrl || null,
          }
        : null,
    }));
  }

  async findAll(filters?: LeaveFilterOptions): Promise<any[]> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      with: {
        staffProfile: true,
        sessions: {
          with: {
            sessionDef: true,
          },
        },
      },
      orderBy: [desc(staffLeaveRequests.createdAt)],
    });

    return records
      .filter((r: any) => {
        if (filters?.status && r.status !== filters.status) return false;
        if (
          filters?.staffType &&
          r.staffProfile?.staffType !== filters.staffType
        )
          return false;
        return true;
      })
      .map((r: any) => ({
        ...this.mapRecordToEntity(r, r.sessions),
        staff: r.staffProfile
          ? {
              id: r.staffProfile.id,
              fullName: r.staffProfile.fullName,
              profession: r.staffProfile.positionTitle,
              idCardNumber: r.staffProfile.staffCode,
              staffType: r.staffProfile.staffType,
              avatarUrl: r.staffProfile.avatarUrl || null,
            }
          : null,
      }));
  }

  async updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    approvedBy: string,
    approvalNotes?: string,
  ): Promise<LeaveEntity | null> {
    const dbStatus = status === 'approved' ? 'approved' : 'rejected';

    const [updated] = await this.db
      .update(staffLeaveRequests)
      .set({
        status: dbStatus,
        reviewedBy: approvedBy || null,
        reviewerNotes: approvalNotes || null,
        reviewedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(staffLeaveRequests.id, id))
      .returning();

    if (!updated) return null;

    if (dbStatus === 'approved') {
      const sessions = await this.db.query.leaveRequestSessions.findMany({
        where: eq(leaveRequestSessions.leaveRequestId, id),
      });
      await this.generateReplacementOpportunities(updated, sessions);
    }

    void this.dispatchLeaveNotification(updated, dbStatus);
    await this.invalidateScheduleCaches();

    return this.mapRecordToEntity(updated);
  }

  async findById(id: string): Promise<LeaveEntity | null> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      where: eq(staffLeaveRequests.id, id),
      with: {
        sessions: {
          with: {
            sessionDef: true,
          },
        },
      },
      limit: 1,
    });
    if (!records.length) return null;
    return this.mapRecordToEntity(records[0], (records[0] as any).sessions);
  }

  async cancel(id: string, staffId: string): Promise<LeaveEntity | null> {
    const records = await this.db.query.staffLeaveRequests.findMany({
      where: eq(staffLeaveRequests.id, id),
      limit: 1,
    });

    if (!records.length) {
      return null;
    }

    const record = records[0];
    if (record.staffProfileId !== staffId) {
      throw new ForbiddenException(
        'Anda tidak memiliki izin membatalkan pengajuan cuti ini',
      );
    }

    if (record.status !== 'pending') {
      throw new BadRequestException(
        'Hanya pengajuan cuti berstatus pending yang dapat dibatalkan',
      );
    }

    const [updated] = await this.db
      .update(staffLeaveRequests)
      .set({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(staffLeaveRequests.id, id))
      .returning();

    void this.dispatchLeaveNotification(updated, 'cancelled');
    await this.invalidateScheduleCaches();

    return updated ? this.mapRecordToEntity(updated) : null;
  }
}

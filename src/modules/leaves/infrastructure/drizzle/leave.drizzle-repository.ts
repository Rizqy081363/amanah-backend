import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  masterDays,
  practitioners,
  sessionDefs,
  shiftExceptions,
  staffLeaveRequests,
  staffProfiles,
  staffRosters,
  staffAttendanceRecords,
} from '../../../../database/schema';
import {
  leavePolicies,
  leaveRequestSessions,
  replacementOpportunities,
} from '../../../../database/schema/leave-payroll.schema';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { LeaveEntity } from '../../domain/entities/leave.entity';
import { LeaveRepository } from '../../domain/repositories/leave.repository';

@Injectable()
export class LeaveDrizzleRepository implements LeaveRepository {
  private readonly logger = new Logger(LeaveDrizzleRepository.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly notificationGateway: NotificationGatewayService,
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
        sessionLabel: s.sessionDef?.labelKey,
        workDate: s.workDate,
      })),
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async getEligibleSessions(
    staffProfileId: string,
    date: string,
  ): Promise<any[]> {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay(); // 0 (Sun) to 6 (Sat)

    // Check if staff has practitioner record
    const [practitioner] = await this.db
      .select()
      .from(practitioners)
      .where(eq(practitioners.staffProfileId, staffProfileId))
      .limit(1);

    let eligibleSessions: any[] = [];

    if (practitioner) {
      // Doctor / Midwife schedule
      const assignments = await this.db.query.doctorAssignments.findMany({
        where: and(
          eq(doctorAssignments.doctorId, practitioner.id),
          eq(doctorAssignments.dow, dayOfWeek),
          eq(doctorAssignments.isActive, true),
        ),
        with: {
          sessionDef: true,
        },
      });

      eligibleSessions = assignments.map((a) => ({
        sessionId: a.sessionId,
        sessionCode: a.sessionDef.code,
        sessionLabel: a.sessionDef.labelKey,
        startsAt: a.sessionDef.defaultStartsAt,
        endsAt: a.sessionDef.defaultEndsAt,
        workDate: date,
      }));
    } else {
      // Operational Worker schedule
      const rosters = await this.db.query.staffRosters.findMany({
        where: and(
          eq(staffRosters.staffProfileId, staffProfileId),
          eq(staffRosters.dow, dayOfWeek),
          eq(staffRosters.isActive, true),
        ),
        with: {
          sessionDef: true,
        },
      });

      eligibleSessions = rosters.map((r) => ({
        sessionId: r.sessionId,
        sessionCode: r.sessionDef.code,
        sessionLabel: r.sessionDef.labelKey,
        startsAt: r.sessionDef.defaultStartsAt,
        endsAt: r.sessionDef.defaultEndsAt,
        workDate: date,
      }));
    }

    // Smart Filter for Today: Exclude shifts already finished, attended, or checked-out
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = date === todayStr;

    if (isToday && eligibleSessions.length > 0) {
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

      eligibleSessions = eligibleSessions.filter((s) => {
        const att = todayAttendances.find(
          (a) =>
            a.sessionId === s.sessionId ||
            (a.shift && a.shift.toLowerCase() === s.sessionCode.toLowerCase()),
        );

        // 1. If staff has already checked out from this session, it cannot be requested as leave
        if (att?.checkOutAt) {
          return false;
        }

        // 2. If staff has already checked in, mid-shift departure belongs to Attendance (Early Check-Out)
        if (att?.checkInAt) {
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
            return false;
          }
        }

        return true;
      });
    }

    return eligibleSessions;
  }

  async create(data: {
    staffId: string;
    practitionerId?: string | null;
    startDate: string;
    endDate: string;
    reason: string;
    type?: string;
    scope?: 'session' | 'full_day';
    sessionIds?: string[];
    substituteStaffId?: string | null;
    documentUrl?: string | null;
  }): Promise<LeaveEntity> {
    const start = new Date(data.startDate).getTime();
    const end = new Date(data.endDate).getTime();
    const durationDays = Math.max(
      1,
      Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1,
    );

    // 1. Check leave policy
    const [policy] = await this.db
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

    // Check monthly limit if applicable
    if (policy && policy.limitMode === 'monthly_limit') {
      const [year, month] = data.startDate.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const existingInMonth = await this.db
        .select()
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

    // 2. Overlapping approved leave protection
    const overlappingApproved = await this.db
      .select({ id: staffLeaveRequests.id })
      .from(staffLeaveRequests)
      .where(
        and(
          eq(staffLeaveRequests.staffProfileId, data.staffId),
          eq(staffLeaveRequests.status, 'approved'),
          lte(staffLeaveRequests.startDate, data.endDate),
          gte(staffLeaveRequests.endDate, data.startDate),
        ),
      );
    if (overlappingApproved.length > 0) {
      throw new BadRequestException(
        'Anda sudah memiliki permohonan cuti yang telah disetujui pada rentang tanggal tersebut',
      );
    }

    // 3. Schedule Operability and Active Shift Protection
    const startDt = new Date(data.startDate);
    const endDt = new Date(data.endDate);
    let totalEligibleSessionsAcrossRange = 0;
    let anyOperatingDayOpen = false;

    for (let cur = new Date(startDt); cur <= endDt; cur.setDate(cur.getDate() + 1)) {
      const curDateStr = cur.toISOString().slice(0, 10);
      const curDow = cur.getDay();

      const masterDay = await this.db.query.masterDays.findFirst({
        where: eq(masterDays.dow, curDow),
      });
      if (!masterDay || masterDay.isActive) {
        anyOperatingDayOpen = true;
      }

      const sessionsOnDate = await this.getEligibleSessions(data.staffId, curDateStr);
      totalEligibleSessionsAcrossRange += sessionsOnDate.length;
    }

    if (!anyOperatingDayOpen) {
      throw new BadRequestException(
        'Klinik tutup pada seluruh tanggal yang dipilih. Tidak dapat mengajukan cuti pada hari libur operasional klinik.',
      );
    }

    if (totalEligibleSessionsAcrossRange === 0) {
      throw new BadRequestException(
        'Tidak dapat mengajukan cuti pada jadwal yang tidak aktif atau sudah ditutup.',
      );
    }

    if (data.scope === 'session') {
      if (!data.sessionIds || data.sessionIds.length === 0) {
        throw new BadRequestException('Sesi praktik harus dipilih untuk permohonan izin parsial.');
      }
      const eligibleOnStart = await this.getEligibleSessions(data.staffId, data.startDate);
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

    let reqType: any = 'other';
    if (data.type) {
      const lower = data.type.toLowerCase();
      if (lower.includes('annual') || lower.includes('tahunan')) {
        reqType = 'annual_leave';
      } else if (lower.includes('sick') || lower.includes('sakit')) {
        reqType = 'sick_leave';
      } else if (lower.includes('seminar')) {
        reqType = 'seminar_symposium';
      } else if (lower.includes('family') || lower.includes('keluarga')) {
        reqType = 'family_matter';
      } else if (lower.includes('external') || lower.includes('tugas')) {
        reqType = 'external_assignment';
      } else {
        reqType = 'other';
      }
    }

    const [record] = await this.db
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
        reviewedAt: initialStatus === 'approved' ? new Date().toISOString() : null,
      })
      .returning();

    // Insert sessions if provided
    const insertedSessions: any[] = [];
    if (data.sessionIds && data.sessionIds.length > 0) {
      for (const sessId of data.sessionIds) {
        const [sessRecord] = await this.db
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

    // If auto-approved, automatically generate open replacement opportunities
    if (initialStatus === 'approved') {
      await this.generateReplacementOpportunities(record, insertedSessions);
      await this.invalidateScheduleCaches();
    }

    // Fire-and-forget notification to RabbitMQ
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
        // Full day: query assigned sessions on start date
        const assigned = await this.getEligibleSessions(
          leaveRequest.staffProfileId,
          leaveRequest.startDate,
        );
        for (const a of assigned) {
          await this.db
            .insert(replacementOpportunities)
            .values({
              leaveRequestId: leaveRequest.id,
              sessionId: a.sessionId,
              workDate: leaveRequest.startDate,
              originalStaffProfileId: leaveRequest.staffProfileId,
              originalPractitionerId: leaveRequest.practitionerId || null,
              status: 'open',
            })
            .onConflictDoNothing();
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

      const staffName = staff?.fullName || 'Staf';
      const staffUserId = staff?.userId;

      if (status === 'pending') {
        // Staff submitted leave -> notify admin role via in_app & push
        await this.notificationGateway.dispatch({
          commandId: `leave-${record.id}-${Date.now()}`,
          sourceDomain: 'leave',
          target: {
            type: 'role',
            roles: ['admin'],
          },
          category: 'shift',
          content: {
            title: `Pengajuan Izin Baru: ${staffName}`,
            body: `${staffName} mengajukan permohonan izin (${record.startDate} s/d ${record.endDate}). Alasan: ${record.reason}`,
            actionUrl: `/dashboard/manajemen-perizinan?leaveId=${record.id}`,
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
            roles: ['admin'],
          },
          category: 'shift',
          content: {
            title: `Pengajuan Izin Dibatalkan: ${staffName}`,
            body: `${staffName} membatalkan pengajuan izin (${record.startDate} s/d ${record.endDate}).`,
            actionUrl: '/dashboard/manajemen-perizinan',
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
          }
        : null,
    }));
  }

  async findAll(filters?: { status?: string; staffType?: string }): Promise<any[]> {
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

import { RedisService } from '@common/redis/redis.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  doctorScheduleStatusHistory,
  masterDays,
  practitioners,
  sessionDefs,
  sessionSchedules,
} from '@database/schema';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { asc, count, desc, eq, or } from 'drizzle-orm';
import {
  DoctorRosterDayDto,
  DoctorRosterOverviewResponse,
  DoctorRosterSessionDto,
  DoctorScheduleHistoryItemEntity,
  DoctorScheduleHistoryResponse,
  UpdateDoctorRosterDto,
} from '../domain/doctor-roster.entity';
import {
  DoctorRosterRepository,
  RecordScheduleHistoryParams,
} from '../domain/doctor-roster.repository';

@Injectable()
export class DrizzleDoctorRosterRepository implements DoctorRosterRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
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
    } catch {
      return;
    }
  }

  async getDoctorRoster(
    doctorId: string,
  ): Promise<DoctorRosterOverviewResponse> {
    const prac = await this.db.query.practitioners.findFirst({
      where: or(
        eq(practitioners.id, doctorId),
        eq(practitioners.staffProfileId, doctorId),
      ),
      with: {
        staffProfile: {
          with: {
            clinicUnit: true,
          },
        },
        medicalSpecialty: true,
      },
    });

    if (!prac) {
      throw new NotFoundException(
        `Dokter dengan ID ${doctorId} tidak ditemukan`,
      );
    }

    const [allDays, allDefs, allSchedules, existingAssignments, allRooms] =
      await Promise.all([
        this.db.query.masterDays.findMany({
          orderBy: [asc(masterDays.sortOrder)],
        }),
        this.db.query.sessionDefs.findMany({
          where: eq(sessionDefs.isActive, true),
          orderBy: [asc(sessionDefs.sortOrder)],
        }),
        this.db.query.sessionSchedules.findMany({
          where: eq(sessionSchedules.isActive, true),
        }),
        this.db.query.doctorAssignments.findMany({
          where: eq(doctorAssignments.doctorId, prac.id),
        }),
        this.db.query.clinicRooms.findMany(),
      ]);

    const doctorName = prac.staffProfile?.fullName || prac.displayName || '';
    const specialization =
      prac.medicalSpecialty?.name ||
      prac.staffProfile?.clinicUnit?.name ||
      prac.staffProfile?.positionTitle ||
      '';

    const roomMap = new Map(allRooms.map((r) => [r.id, r.name]));

    const hasAnyCustomRoster = existingAssignments.some(
      (da) => da.dow !== null,
    );

    const days: DoctorRosterDayDto[] = allDays.map((d) => {
      const isOperatingDay = d.isActive;
      const hasOverride = hasAnyCustomRoster;

      const daySessions: DoctorRosterSessionDto[] = allDefs.map((def) => {
        const sched = allSchedules.find(
          (s) => s.dow === d.dow && s.sessionId === def.id,
        );

        const startTime = sched?.startsAt
          ? sched.startsAt.slice(0, 5)
          : def.defaultStartsAt.slice(0, 5);
        const endTime = sched?.endsAt
          ? sched.endsAt.slice(0, 5)
          : def.defaultEndsAt.slice(0, 5);
        const timeRange = `${startTime} - ${endTime}`;

        const explicitAssignment = existingAssignments.find(
          (da) => da.sessionId === def.id && da.dow === d.dow,
        );
        const genericAssignment = existingAssignments.find(
          (da) => da.sessionId === def.id && da.dow === null,
        );

        const isTemplateActive = d.isActive && Boolean(sched);

        let isActive = false;
        let assignment = explicitAssignment;

        if (hasAnyCustomRoster) {
          isActive = Boolean(explicitAssignment && explicitAssignment.isActive);
          assignment = explicitAssignment;
        } else if (genericAssignment) {
          isActive = isTemplateActive;
          assignment = isTemplateActive ? genericAssignment : undefined;
        } else {
          // Virtual Baseline: Doctor has no custom assignments, so they inherit the clinic master weekly template
          isActive = isTemplateActive;
          assignment = undefined;
        }

        const preferredRoomId = assignment?.preferredRoomId || null;
        const preferredRoomName = preferredRoomId
          ? roomMap.get(preferredRoomId) || null
          : null;

        return {
          sessionId: def.id,
          sessionCode: def.code,
          sessionLabel: def.label || def.code,
          timeRange,
          isActive,
          isTemplateActive,
          preferredRoomId,
          preferredRoomName,
        };
      });

      const isDoctorActive = daySessions.some((s) => s.isActive);

      return {
        dow: d.dow,
        dayCode: d.code,
        dayName: d.nameId,
        sortOrder: d.sortOrder,
        isWeekend: d.isWeekend,
        isOperatingDay,
        isDoctorActive,
        hasOverride,
        sessions: daySessions,
      };
    });

    return {
      doctorId: prac.id,
      doctorName,
      specialization,
      hasAnyOverride: hasAnyCustomRoster,
      days,
    };
  }

  async updateDoctorRoster(
    doctorId: string,
    dto: UpdateDoctorRosterDto,
    userId?: string,
  ): Promise<DoctorRosterOverviewResponse> {
    const prac = await this.db.query.practitioners.findFirst({
      where: or(
        eq(practitioners.id, doctorId),
        eq(practitioners.staffProfileId, doctorId),
      ),
    });

    if (!prac) {
      throw new NotFoundException(
        `Dokter dengan ID ${doctorId} tidak ditemukan`,
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(doctorAssignments)
        .where(eq(doctorAssignments.doctorId, prac.id));

      const activeSessionDefs = await tx.query.sessionDefs.findMany({
        where: eq(sessionDefs.isActive, true),
      });
      const activeSessionIds = new Set(activeSessionDefs.map((s: any) => s.id));

      const validItems = dto.assignments.filter((a) =>
        activeSessionIds.has(a.sessionId),
      );

      if (validItems.length > 0) {
        await tx.insert(doctorAssignments).values(
          validItems.map((item) => ({
            doctorId: prac.id,
            sessionId: item.sessionId,
            dow: item.dow,
            preferredRoomId: item.preferredRoomId || null,
            isActive: Boolean(item.isActive),
          })),
        );
      }

      if (validItems.length > 0) {
        await tx.insert(doctorScheduleStatusHistory).values(
          validItems.map((item) => ({
            doctorId: prac.id,
            sessionId: item.sessionId,
            dow: item.dow,
            action: 'assign_roster' as const,
            newStatus: item.isActive ? 'OPEN' : 'CLOSED',
            reason: dto.reason || 'Pembaruan roster operasional mingguan dokter',
            metadata: {
              isActive: item.isActive,
              preferredRoomId: item.preferredRoomId || null,
            },
            changedBy: userId || null,
          })),
        );
      }
    });

    await this.invalidateScheduleCaches();

    return this.getDoctorRoster(prac.id);
  }

  async resetDoctorRoster(
    doctorId: string,
    userId?: string,
  ): Promise<DoctorRosterOverviewResponse> {
    const prac = await this.db.query.practitioners.findFirst({
      where: or(
        eq(practitioners.id, doctorId),
        eq(practitioners.staffProfileId, doctorId),
      ),
    });

    if (!prac) {
      throw new NotFoundException(
        `Dokter dengan ID ${doctorId} tidak ditemukan`,
      );
    }

    await this.db.transaction(async (tx) => {
      // 1. Delete all explicit assignments (with dow) for this doctor
      await tx
        .delete(doctorAssignments)
        .where(eq(doctorAssignments.doctorId, prac.id));

      // 2. Query active session definitions
      const activeSessionDefs = await tx.query.sessionDefs.findMany({
        where: eq(sessionDefs.isActive, true),
      });

      // 3. Restore default generic assignments (dow = null) so doctor adheres to clinic weekly master template
      if (activeSessionDefs.length > 0) {
        await tx.insert(doctorAssignments).values(
          activeSessionDefs.map((def: any) => ({
            doctorId: prac.id,
            sessionId: def.id,
            dow: null,
            preferredRoomId: null,
            isActive: true,
          })),
        );
      }

      // 4. Record audit history
      if (activeSessionDefs.length > 0) {
        await tx.insert(doctorScheduleStatusHistory).values(
          activeSessionDefs.map((def: any) => ({
            doctorId: prac.id,
            sessionId: def.id,
            dow: null,
            action: 'remove_roster' as const,
            newStatus: 'OPEN',
            reason: 'Roster direset ke template mingguan klinik',
            metadata: {
              action: 'reset_to_weekly_template',
            },
            changedBy: userId || null,
          })),
        );
      }
    });

    await this.invalidateScheduleCaches();

    return this.getDoctorRoster(prac.id);
  }

  async getDoctorScheduleHistory(
    doctorId: string,
    limit = 20,
    offset = 0,
  ): Promise<DoctorScheduleHistoryResponse> {
    const [rows, totalResult] = await Promise.all([
      this.db.query.doctorScheduleStatusHistory.findMany({
        where: eq(doctorScheduleStatusHistory.doctorId, doctorId),
        with: {
          sessionDef: true,
          masterDay: true,
          changedByUser: true,
        },
        orderBy: [desc(doctorScheduleStatusHistory.createdAt)],
        limit,
        offset,
      }),
      this.db
        .select({ value: count() })
        .from(doctorScheduleStatusHistory)
        .where(eq(doctorScheduleStatusHistory.doctorId, doctorId)),
    ]);

    const total = totalResult[0]?.value ?? 0;

    const items: DoctorScheduleHistoryItemEntity[] = rows.map((r) => {
      const sessionLabel = r.sessionDef?.label || r.sessionDef?.code || null;

      return {
        id: r.id,
        doctorId: r.doctorId,
        scheduleDate: r.scheduleDate || null,
        sessionLabel,
        dayName: r.masterDay?.nameId || null,
        action: r.action,
        previousStatus: r.previousStatus || null,
        newStatus: r.newStatus || null,
        reason: r.reason || null,
        changedByName: r.changedByUser?.name || null,
        createdAt: r.createdAt,
      };
    });

    return {
      items,
      total,
    };
  }

  async recordScheduleHistory(
    params: RecordScheduleHistoryParams,
  ): Promise<void> {
    await this.db.insert(doctorScheduleStatusHistory).values({
      doctorId: params.doctorId,
      scheduleDate: params.scheduleDate || null,
      sessionId: params.sessionId || null,
      dow: params.dow ?? null,
      action: params.action,
      previousStatus: params.previousStatus || null,
      newStatus: params.newStatus || null,
      reason: params.reason || null,
      metadata: params.metadata || {},
      changedBy: params.changedBy || null,
    });
  }
}

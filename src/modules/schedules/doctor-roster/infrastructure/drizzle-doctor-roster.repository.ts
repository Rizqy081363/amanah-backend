import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicRooms,
  doctorAssignments,
  doctorScheduleStatusHistory,
  masterDays,
  practitioners,
  sessionDefs,
  sessionSchedules,
  users,
} from '@database/schema';
import { RedisService } from '@common/redis/redis.service';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
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

  async getDoctorRoster(doctorId: string): Promise<DoctorRosterOverviewResponse> {
    const prac = await this.db.query.practitioners.findFirst({
      where: eq(practitioners.id, doctorId),
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
      throw new NotFoundException(`Dokter dengan ID ${doctorId} tidak ditemukan`);
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
          where: and(
            eq(doctorAssignments.doctorId, doctorId),
            eq(doctorAssignments.isActive, true),
          ),
        }),
        this.db.query.clinicRooms.findMany(),
      ]);

    const doctorName =
      prac.staffProfile?.fullName || prac.displayName || 'Dokter Amanah';
    const specialization =
      prac.medicalSpecialty?.name ||
      prac.staffProfile?.clinicUnit?.name ||
      'Dokter Umum';

    const operatingDows = new Set(
      allSchedules.map((s) => s.dow),
    );

    const roomMap = new Map(allRooms.map((r) => [r.id, r.name]));

    const days: DoctorRosterDayDto[] = allDays.map((d) => {
      const isOperatingDay = operatingDows.has(d.dow);

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

        const assignment = existingAssignments.find(
          (da) =>
            da.sessionId === def.id &&
            (da.dow === d.dow || da.dow === null),
        );

        const isActive = Boolean(assignment);
        const preferredRoomId = assignment?.preferredRoomId || null;
        const preferredRoomName = preferredRoomId
          ? roomMap.get(preferredRoomId) || null
          : null;

        let sessionLabel = def.code;
        if (def.labelKey === 'session.early_morning') {
          sessionLabel = 'Sesi Dini Hari';
        } else if (def.labelKey === 'session.morning') {
          sessionLabel = 'Sesi Pagi';
        } else if (def.labelKey === 'session.afternoon') {
          sessionLabel = 'Sesi Siang';
        } else if (def.labelKey === 'session.night') {
          sessionLabel = 'Sesi Malam';
        }

        return {
          sessionId: def.id,
          sessionCode: def.code,
          sessionLabel,
          timeRange,
          isActive,
          preferredRoomId,
          preferredRoomName,
        };
      });

      return {
        dow: d.dow,
        dayCode: d.code,
        dayName: d.nameId,
        sortOrder: d.sortOrder,
        isWeekend: d.isWeekend,
        isOperatingDay,
        sessions: daySessions,
      };
    });

    return {
      doctorId: prac.id,
      doctorName,
      specialization,
      days,
    };
  }

  async updateDoctorRoster(
    doctorId: string,
    dto: UpdateDoctorRosterDto,
    userId?: string,
  ): Promise<DoctorRosterOverviewResponse> {
    const prac = await this.db.query.practitioners.findFirst({
      where: eq(practitioners.id, doctorId),
    });

    if (!prac) {
      throw new NotFoundException(`Dokter dengan ID ${doctorId} tidak ditemukan`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(doctorAssignments)
        .where(eq(doctorAssignments.doctorId, doctorId));

      const activeItems = dto.assignments.filter((a) => a.isActive);

      if (activeItems.length > 0) {
        await tx.insert(doctorAssignments).values(
          activeItems.map((item) => ({
            doctorId,
            sessionId: item.sessionId,
            dow: item.dow,
            preferredRoomId: item.preferredRoomId || null,
            isActive: true,
          })),
        );
      }

      await tx.insert(doctorScheduleStatusHistory).values({
        doctorId,
        action: 'assign_roster',
        newStatus: 'OPEN',
        reason: dto.reason || 'Pembaruan roster operasional mingguan dokter',
        metadata: {
          assignedSessionsCount: activeItems.length,
          assignedSessions: activeItems.map((a) => ({ dow: a.dow, sessionId: a.sessionId })),
        },
        changedBy: userId || null,
      });
    });

    await this.invalidateScheduleCaches();

    return this.getDoctorRoster(doctorId);
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
      let sessionLabel: string | null = null;
      if (r.sessionDef) {
        if (r.sessionDef.labelKey === 'session.early_morning') {
          sessionLabel = 'Dini Hari';
        } else if (r.sessionDef.labelKey === 'session.morning') {
          sessionLabel = 'Pagi';
        } else if (r.sessionDef.labelKey === 'session.afternoon') {
          sessionLabel = 'Siang';
        } else if (r.sessionDef.labelKey === 'session.night') {
          sessionLabel = 'Malam';
        } else {
          sessionLabel = r.sessionDef.code;
        }
      }

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

  async recordScheduleHistory(params: RecordScheduleHistoryParams): Promise<void> {
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

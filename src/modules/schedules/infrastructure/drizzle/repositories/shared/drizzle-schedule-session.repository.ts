import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  doctorAssignments,
  sessionDefs,
  sessionSchedules,
  shiftExceptions,
} from '@database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '@modules/schedules/domain/constants/schedule.constants';
import type { ScheduleEntity } from '@modules/schedules/domain/entities/schedule.entity';
import { SchedulePersistenceStatus } from '@modules/schedules/domain/schedule-status';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ClinicConfigService } from '@common/clinic-config/clinic-config.service';
import { isUUID } from 'class-validator';
import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleSessionRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly conflictQuery: ScheduleConflictQuery,
    @Optional()
    private readonly clinicConfig?: ClinicConfigService,
  ) {}

  async create(
    data: Omit<ScheduleEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ScheduleEntity> {
    const practitioner = await this.practitionerResolver.resolve(data.staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${data.staffId} tidak ditemukan`,
      );
    }
    const practitionerId = practitioner.id;

    const shift = data.session;
    const sessionDef = await this.db.query.sessionDefs.findFirst({
      where: eq(sessionDefs.code, shift),
    });
    if (!sessionDef) {
      throw new BadRequestException(`Sesi dinas tidak valid: ${shift}`);
    }

    const sessionLabel = sessionDef.code;
    const targetDate = data.scheduleDate;
    if (!targetDate) {
      throw new BadRequestException('Tanggal jadwal (scheduleDate) wajib diisi');
    }
    const defaultStartTime = data.startTime || sessionDef.defaultStartsAt;
    const defaultEndTime = data.endTime || sessionDef.defaultEndsAt;

    let roomId = data.roomId || null;
    if (!roomId && data.poliklinikId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.unitId, data.poliklinikId),
      });
      if (room) roomId = room.id;
    }

    await this.conflictQuery.checkConflicts(
      practitionerId,
      targetDate,
      defaultStartTime,
      defaultEndTime,
      roomId,
    );

    const isAvailable = data.isAvailable ?? true;
    const [exception] = await this.db
      .insert(shiftExceptions)
      .values({
        doctorId: practitionerId,
        serviceDate: targetDate,
        sessionId: sessionDef.id,
        type: isAvailable ? 'extra' : 'leave',
        note: data.notes || sessionLabel,
      })
      .returning();

    const entity =
      (await this.findById(exception.id)) ||
      ({
        id: exception.id,
        staffId: practitioner.staffProfileId,
        scheduleDate: targetDate,
        session: shift,
        sessionShift: shift,
        sessionLabel,
        startTime: defaultStartTime.slice(0, 5),
        endTime: defaultEndTime.slice(0, 5),
        roomId,
        poliklinikId: data.poliklinikId,
        isAvailable,
        notes: data.notes || null,
        createdAt: exception.createdAt,
        updatedAt: exception.updatedAt,
      } as any);

    return entity;
  }

  async findById(id: string): Promise<ScheduleEntity | null> {
    if (id.startsWith('roster-')) {
      const daId = id.slice(7, 43);
      const targetDate = id.slice(44);
      if (!isUUID(daId)) return null;
      const da = await this.db.query.doctorAssignments.findFirst({
        where: eq(doctorAssignments.id, daId),
        with: {
          sessionDef: {
            with: { schedules: true },
          },
          preferredRoom: {
            with: { clinicUnit: true },
          },
          practitioner: {
            with: {
              staffProfile: {
                with: { clinicUnit: true },
              },
            },
          },
        },
      });
      if (!da || !da.sessionDef) return null;

      const dayDow = new Date(targetDate).getDay();
      const sched = da.sessionDef.schedules?.find(
        (s) => s.dow === dayDow && s.isActive,
      );
      const startTime = (
        sched?.startsAt || da.sessionDef.defaultStartsAt
      ).slice(0, 5);
      const endTime = (sched?.endsAt || da.sessionDef.defaultEndsAt).slice(
        0,
        5,
      );

      const exception = await this.db.query.shiftExceptions.findFirst({
        where: and(
          eq(shiftExceptions.doctorId, da.doctorId),
          eq(shiftExceptions.serviceDate, targetDate),
          eq(shiftExceptions.sessionId, da.sessionId),
        ),
      });

      const isLeave = exception?.type === 'leave';

      return ScheduleRecordMapper.toEntity({
        id,
        practitionerId: da.doctorId,
        scheduleDate: targetDate,
        sessionLabel: da.sessionDef.label,
        sessionShift: da.sessionDef.code as any,
        startTime: `${startTime}:00`,
        endTime: `${endTime}:00`,
        roomId: da.preferredRoomId,
        serviceId: da.categoryId,
        status: isLeave
          ? SchedulePersistenceStatus.CLOSED
          : SchedulePersistenceStatus.OPEN,
        notes: exception?.note || null,
        createdAt: da.createdAt,
        updatedAt: da.updatedAt,
        practitioner: da.practitioner,
        clinicRoom: da.preferredRoom,
        clinicService: null,
      });
    }

    if (!isUUID(id)) {
      return null;
    }

    const exception = await this.db.query.shiftExceptions.findFirst({
      where: eq(shiftExceptions.id, id),
      with: {
        sessionDef: true,
        practitioner: {
          with: {
            staffProfile: {
              with: { clinicUnit: true },
            },
            clinicRoom: true,
          },
        },
      },
    });

    if (exception) {
      const sDef = exception.sessionDef;
      const startTime = sDef ? sDef.defaultStartsAt : null;
      const endTime = sDef ? sDef.defaultEndsAt : null;
      const isLeave = exception.type === 'leave';

      return ScheduleRecordMapper.toEntity({
        id: exception.id,
        practitionerId: exception.doctorId,
        scheduleDate: exception.serviceDate,
        sessionLabel: sDef?.label ?? null,
        sessionShift: (sDef?.code as any) ?? null,
        startTime,
        endTime,
        roomId: exception.practitioner?.defaultRoomId || null,
        serviceId: null,
        status: isLeave
          ? SchedulePersistenceStatus.CLOSED
          : SchedulePersistenceStatus.OPEN,
        notes: exception.note,
        createdAt: exception.createdAt,
        updatedAt: exception.updatedAt,
        practitioner: exception.practitioner,
        clinicRoom: exception.practitioner?.clinicRoom || null,
        clinicService: null,
      });
    }

    const da = await this.db.query.doctorAssignments.findFirst({
      where: eq(doctorAssignments.id, id),
      with: {
        sessionDef: true,
        preferredRoom: {
          with: { clinicUnit: true },
        },
        practitioner: {
          with: {
            staffProfile: {
              with: { clinicUnit: true },
            },
          },
        },
      },
    });

    if (da && da.sessionDef) {
      const today = new Date().toISOString().slice(0, 10);
      const startTime = da.sessionDef.defaultStartsAt;
      const endTime = da.sessionDef.defaultEndsAt;

      return ScheduleRecordMapper.toEntity({
        id: da.id,
        practitionerId: da.doctorId,
        scheduleDate: today,
        sessionLabel: da.sessionDef.label,
        sessionShift: da.sessionDef.code as any,
        startTime,
        endTime,
        roomId: da.preferredRoomId,
        serviceId: da.categoryId,
        status: da.isActive
          ? SchedulePersistenceStatus.OPEN
          : SchedulePersistenceStatus.CLOSED,
        notes: null,
        createdAt: da.createdAt,
        updatedAt: da.updatedAt,
        practitioner: da.practitioner,
        clinicRoom: da.preferredRoom,
        clinicService: null,
      });
    }

    const sDef = await this.db.query.sessionDefs.findFirst({
      where: eq(sessionDefs.id, id),
      with: { schedules: true },
    });

    if (sDef) {
      const da = await this.db.query.doctorAssignments.findFirst({
        where: and(
          eq(doctorAssignments.sessionId, sDef.id),
          eq(doctorAssignments.isActive, true),
        ),
        with: {
          preferredRoom: { with: { clinicUnit: true } },
          practitioner: {
            with: {
              staffProfile: { with: { clinicUnit: true } },
            },
          },
        },
      });

      const today = new Date().toISOString().slice(0, 10);
      return ScheduleRecordMapper.toEntity({
        id: da?.id || sDef.id,
        sessionId: sDef.id,
        practitionerId: da?.doctorId || '',
        scheduleDate: today,
        sessionLabel: sDef.label,
        sessionShift: sDef.code as any,
        startTime: sDef.defaultStartsAt,
        endTime: sDef.defaultEndsAt,
        roomId: da?.preferredRoomId || null,
        serviceId: da?.categoryId || null,
        status: SchedulePersistenceStatus.OPEN,
        notes: null,
        createdAt: sDef.createdAt,
        updatedAt: sDef.updatedAt,
        practitioner: da?.practitioner || null,
        clinicRoom: da?.preferredRoom || null,
        clinicService: null,
      });
    }

    return null;
  }

  async findAll(
    limit = 20,
    offset = 0,
    filters?: {
      poliklinikId?: string;
      staffId?: string;
      date?: string;
    },
  ): Promise<ScheduleEntity[]> {
    const targetDate = filters?.date || new Date().toISOString().slice(0, 10);
    const targetDow = new Date(targetDate).getDay();

    let practitionerId: string | undefined;
    if (filters?.staffId) {
      const practitioner = await this.practitionerResolver.resolve(
        filters.staffId,
      );
      if (practitioner) practitionerId = practitioner.id;
    }

    const [assignments, exceptions] = await Promise.all([
      this.db.query.doctorAssignments.findMany({
        where: and(
          eq(doctorAssignments.isActive, true),
          practitionerId
            ? eq(doctorAssignments.doctorId, practitionerId)
            : sql`TRUE`,
          or(
            eq(doctorAssignments.dow, targetDow),
            sql`${doctorAssignments.dow} IS NULL`,
          ),
        ),
        with: {
          sessionDef: {
            with: { schedules: true },
          },
          preferredRoom: {
            with: { clinicUnit: true },
          },
          practitioner: {
            with: {
              staffProfile: {
                with: { clinicUnit: true },
              },
            },
          },
        },
      }),
      this.db.query.shiftExceptions.findMany({
        where: and(
          eq(shiftExceptions.serviceDate, targetDate),
          practitionerId
            ? eq(shiftExceptions.doctorId, practitionerId)
            : sql`TRUE`,
        ),
      }),
    ]);

    const results: ScheduleEntity[] = [];

    for (const da of assignments) {
      if (!da.sessionDef || !da.sessionDef.isActive) continue;

      const ex = exceptions.find(
        (e) =>
          e.doctorId === da.doctorId &&
          (!e.sessionId || e.sessionId === da.sessionId),
      );
      const isLeave = ex?.type === 'leave';

      const sched = da.sessionDef.schedules?.find(
        (s) => s.dow === targetDow && s.isActive,
      );
      const startTime = sched?.startsAt || da.sessionDef.defaultStartsAt;
      const endTime = sched?.endsAt || da.sessionDef.defaultEndsAt;

      const entity = ScheduleRecordMapper.toEntity({
        id: da.id,
        sessionId: da.sessionId,
        practitionerId: da.doctorId,
        scheduleDate: targetDate,
        sessionLabel: da.sessionDef.label,
        sessionShift: da.sessionDef.code as any,
        startTime,
        endTime,
        roomId: da.preferredRoomId,
        serviceId: da.categoryId,
        status: isLeave
          ? SchedulePersistenceStatus.CLOSED
          : SchedulePersistenceStatus.OPEN,
        notes: ex?.note || null,
        createdAt: da.createdAt,
        updatedAt: da.updatedAt,
        practitioner: da.practitioner,
        clinicRoom: da.preferredRoom,
        clinicService: null,
      });

      if (
        filters?.poliklinikId &&
        entity.poliklinikId !== filters.poliklinikId
      ) {
        continue;
      }
      results.push(entity);
    }

    return results.slice(offset, offset + limit);
  }

  async findByStaffId(staffId: string): Promise<ScheduleEntity[]> {
    return this.findMySchedules(staffId);
  }

  async findMySchedules(
    staffId: string,
    filters?: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<ScheduleEntity[]> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      return [];
    }
    const targetId = practitioner.id;

    const startDate = filters?.date || filters?.startDate || new Date().toISOString().slice(0, 10);
    const endDate = filters?.date || filters?.endDate || startDate;

    const [assignments, exceptions, templateSchedules] = await Promise.all([
      this.db.query.doctorAssignments.findMany({
        where: eq(doctorAssignments.doctorId, targetId),
        with: {
          sessionDef: {
            with: { schedules: true },
          },
          preferredRoom: {
            with: { clinicUnit: true },
          },
          practitioner: {
            with: {
              staffProfile: {
                with: { clinicUnit: true },
              },
            },
          },
        },
      }),
      this.db.query.shiftExceptions.findMany({
        where: and(
          eq(shiftExceptions.doctorId, targetId),
          gte(shiftExceptions.serviceDate, startDate),
          lte(shiftExceptions.serviceDate, endDate),
        ),
      }),
      this.db.query.sessionSchedules.findMany({
        where: eq(sessionSchedules.isActive, true),
        with: {
          sessionDef: true,
        },
      }),
    ]);

    const results: ScheduleEntity[] = [];
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);

    for (let d = new Date(startObj); d <= endObj; d.setDate(d.getDate() + 1)) {
      const curDateStr = d.toISOString().slice(0, 10);
      const curDow = d.getDay();

      const dayAssignments = assignments.filter(
        (da) => da.dow === null || da.dow === curDow,
      );

      // 1. Process explicit doctor assignments for this day
      const processedSessionIds = new Set<string>();

      for (const da of dayAssignments) {
        if (!da.sessionDef || !da.sessionDef.isActive) continue;
        processedSessionIds.add(da.sessionId);
        if (!da.isActive) continue; // explicitly deactivated by doctor

        const ex = exceptions.find(
          (e) =>
            e.serviceDate === curDateStr &&
            (!e.sessionId || e.sessionId === da.sessionId),
        );
        const isLeave = ex?.type === 'leave';

        const sched = da.sessionDef.schedules?.find(
          (s) => s.dow === curDow && s.isActive,
        );
        const startTime = sched?.startsAt || da.sessionDef.defaultStartsAt;
        const endTime = sched?.endsAt || da.sessionDef.defaultEndsAt;

        results.push(
          ScheduleRecordMapper.toEntity({
            id: da.id,
            sessionId: da.sessionId,
            practitionerId: da.doctorId,
            scheduleDate: curDateStr,
            sessionLabel: da.sessionDef.label,
            sessionShift: da.sessionDef.code as any,
            startTime,
            endTime,
            roomId: da.preferredRoomId,
            serviceId: da.categoryId,
            status: isLeave
              ? SchedulePersistenceStatus.CLOSED
              : SchedulePersistenceStatus.OPEN,
            notes: ex?.note || null,
            createdAt: da.createdAt,
            updatedAt: da.updatedAt,
            practitioner: da.practitioner,
            clinicRoom: da.preferredRoom,
            clinicService: null,
          }),
        );
      }

      // 2. Virtual Baseline: inherit active clinic weekly template for unassigned sessions
      const dayTemplates = templateSchedules.filter(
        (ts) => ts.dow === curDow && ts.sessionDef?.isActive,
      );

      for (const ts of dayTemplates) {
        if (!ts.sessionDef || processedSessionIds.has(ts.sessionId)) continue;

        const ex = exceptions.find(
          (e) =>
            e.serviceDate === curDateStr &&
            (!e.sessionId || e.sessionId === ts.sessionId),
        );
        const isLeave = ex?.type === 'leave';

        const startTime = ts.startsAt || ts.sessionDef.defaultStartsAt;
        const endTime = ts.endsAt || ts.sessionDef.defaultEndsAt;

        results.push(
          ScheduleRecordMapper.toEntity({
            id: `template-${ts.id}`,
            sessionId: ts.sessionId,
            practitionerId: targetId,
            scheduleDate: curDateStr,
            sessionLabel: ts.sessionDef.label,
            sessionShift: ts.sessionDef.code as any,
            startTime,
            endTime,
            roomId: practitioner.defaultRoomId || null,
            serviceId: null,
            status: isLeave
              ? SchedulePersistenceStatus.CLOSED
              : SchedulePersistenceStatus.OPEN,
            notes: ex?.note || null,
            createdAt: ts.sessionDef.createdAt,
            updatedAt: ts.sessionDef.updatedAt,
            practitioner: practitioner as any,
            clinicRoom: null,
            clinicService: null,
          }),
        );
      }
    }

    if (results.length > 1) {
      const tz = this.clinicConfig
        ? await this.clinicConfig.getTimezone()
        : 'Asia/Jakarta';

      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const parts = formatter.formatToParts(now);
      const partMap: Record<string, string> = {};
      for (const p of parts) {
        partMap[p.type] = p.value;
      }
      const curHour = parseInt(partMap.hour, 10) || 0;
      const curMin = parseInt(partMap.minute, 10) || 0;
      const currentMinutes = curHour * 60 + curMin;
      const currentDateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;

      const parseTimeToMinutes = (timeStr?: string | null): number => {
        if (!timeStr) return 0;
        const clean = timeStr.trim();
        const p = clean.split(':');
        const h = parseInt(p[0], 10) || 0;
        const m = parseInt(p[1], 10) || 0;
        return h * 60 + m;
      };

      const calculateScore = (s: ScheduleEntity): number => {
        const schedDate = s.scheduleDate;
        const startMin = parseTimeToMinutes(s.startTime);
        let endMin = parseTimeToMinutes(s.endTime);
        if (endMin <= startMin) endMin = 1440;

        if (schedDate === currentDateStr) {
          // Priority 0: Active session right now
          if (startMin <= currentMinutes && currentMinutes < endMin) {
            return 0;
          }
          // Priority 1: Upcoming session today (soonest start first)
          if (currentMinutes < startMin) {
            return 10000 + (startMin - currentMinutes);
          }
          // Priority 2: Past session today (most recently ended first)
          return 20000 + (currentMinutes - endMin);
        }

        // Priority 3: Future or past dates
        const dateDiff = Math.abs(
          new Date(schedDate).getTime() - new Date(currentDateStr).getTime(),
        );
        const days = Math.round(dateDiff / (1000 * 60 * 60 * 24));
        if (schedDate > currentDateStr) {
          return 30000 + days * 1440 + startMin;
        }
        return 40000 + days * 1440;
      };

      results.sort((a, b) => calculateScore(a) - calculateScore(b));
    }

    return results;
  }

  async findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]> {
    const list = await this.findAll(100, 0, {
      poliklinikId,
      date,
    });
    return list.filter((s) => s.isAvailable);
  }

  async update(
    id: string,
    data: Partial<ScheduleEntity>,
  ): Promise<ScheduleEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    let targetDate = existing.scheduleDate ?? '';
    if (data.scheduleDate) {
      targetDate = data.scheduleDate;
    }

    const practitioner = await this.practitionerResolver.resolve(
      existing.staffId,
    );
    const practitionerId = practitioner ? practitioner.id : existing.staffId;

    let targetSessionDefId: string | null = null;
    const da = await this.db.query.doctorAssignments.findFirst({
      where: eq(doctorAssignments.id, id),
    });
    if (da) {
      targetSessionDefId = da.sessionId;
    }

    if (data.status !== undefined || data.isAvailable !== undefined) {
      const isClosed =
        data.status === SchedulePersistenceStatus.CLOSED ||
        data.isAvailable === false;

      if (isClosed) {
        const existingLeave = await this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.doctorId, practitionerId),
            eq(shiftExceptions.serviceDate, targetDate),
            eq(shiftExceptions.type, 'leave'),
            targetSessionDefId
              ? eq(shiftExceptions.sessionId, targetSessionDefId)
              : sql`TRUE`,
          ),
        });

        if (existingLeave) {
          await this.db
            .update(shiftExceptions)
            .set({
              note: data.notes || 'Sesi jadwal dinonaktifkan',
              updatedAt: new Date().toISOString(),
            })
            .where(eq(shiftExceptions.id, existingLeave.id));
        } else {
          await this.db.insert(shiftExceptions).values({
            doctorId: practitionerId,
            serviceDate: targetDate,
            sessionId: targetSessionDefId,
            type: 'leave',
            note: data.notes || 'Sesi jadwal dinonaktifkan',
          });
        }
      } else {
        await this.db
          .delete(shiftExceptions)
          .where(
            and(
              eq(shiftExceptions.doctorId, practitionerId),
              eq(shiftExceptions.serviceDate, targetDate),
              eq(shiftExceptions.type, 'leave'),
              targetSessionDefId
                ? eq(shiftExceptions.sessionId, targetSessionDefId)
                : sql`TRUE`,
            ),
          );
      }
    }

    return this.findById(id);
  }

  async toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null> {
    return this.update(id, { isAvailable });
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;

    const practitioner = await this.practitionerResolver.resolve(
      existing.staffId,
    );
    const practitionerId = practitioner ? practitioner.id : existing.staffId;
    const targetDate = existing.scheduleDate ?? '';

    const activeAppointments = await this.db.query.appointments.findMany({
      where: and(
        eq(appointments.practitionerId, practitionerId),
        eq(appointments.scheduledDate, targetDate),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
      ),
    });

    if (activeAppointments.length > 0) {
      throw new ConflictException({
        code: 'SCHEDULE_HAS_ACTIVE_BOOKINGS',
        message: `Jadwal tidak dapat dihapus karena sudah memiliki ${activeAppointments.length} pasien terdaftar. Batalkan atau jadwalkan ulang janji temu pasien terlebih dahulu.`,
      });
    }

    if (id.startsWith('roster-')) {
      const daId = id.slice(7, 43);
      if (!isUUID(daId)) {
        throw new NotFoundException(`Format ID roster ${id} tidak valid`);
      }
      await this.db
        .update(doctorAssignments)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(doctorAssignments.id, daId));
      return true;
    }

    if (!isUUID(id)) {
      throw new NotFoundException(`Format ID sesi ${id} tidak valid`);
    }

    await this.db.delete(shiftExceptions).where(eq(shiftExceptions.id, id));

    return true;
  }
}

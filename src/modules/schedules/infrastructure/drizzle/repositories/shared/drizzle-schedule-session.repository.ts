import { ClinicTimeService } from '@common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  doctorAssignments,
  sessionDefs,
  shiftExceptions,
} from '@database/schema';
import { SHIFT_EXCEPTION_TYPE } from '@modules/appointments/domain/constants/appointment-lifecycle.constants';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  isUuid,
} from '@modules/schedules/domain/constants/schedule.constants';
import type { ScheduleEntity } from '@modules/schedules/domain/entities/schedule.entity';
import type { SessionShiftType } from '@modules/schedules/domain/factories/schedule-session.factory';
import { SchedulePersistenceStatus } from '@modules/schedules/domain/schedule-status';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import { DoctorMySchedulesQuery } from '@modules/schedules/infrastructure/drizzle/queries/doctor-my-schedules.query';
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
import { and, eq, inArray, or, sql } from 'drizzle-orm';

export interface ScheduleSessionFilter {
  poliklinikId?: string;
  staffId?: string;
  date?: string;
}

export interface MySchedulesFilter {
  date?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class DrizzleScheduleSessionRepository {
  private readonly resolvedMySchedulesQuery: DoctorMySchedulesQuery;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly conflictQuery: ScheduleConflictQuery,
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    mySchedulesQuery?: DoctorMySchedulesQuery,
  ) {
    this.resolvedMySchedulesQuery =
      mySchedulesQuery ??
      new DoctorMySchedulesQuery(
        db,
        practitionerResolver,
        clinicTimeService,
      );
  }

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

    const sessionLabel = sessionDef.label || sessionDef.code;
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
    const exceptionType = isAvailable
      ? SHIFT_EXCEPTION_TYPE.EXTRA
      : SHIFT_EXCEPTION_TYPE.LEAVE;

    const [exception] = await this.db
      .insert(shiftExceptions)
      .values({
        doctorId: practitionerId,
        serviceDate: targetDate,
        sessionId: sessionDef.id,
        type: exceptionType,
        note: data.notes || sessionLabel,
      })
      .returning();

    const entity = await this.findById(exception.id);
    if (entity) {
      return entity;
    }

    return ScheduleRecordMapper.toEntity({
      id: exception.id,
      sessionId: sessionDef.id,
      practitionerId,
      scheduleDate: targetDate,
      sessionLabel,
      sessionShift: sessionDef.code as SessionShiftType,
      startTime: defaultStartTime.slice(0, 5),
      endTime: defaultEndTime.slice(0, 5),
      roomId,
      serviceId: data.serviceId || null,
      status: isAvailable
        ? SchedulePersistenceStatus.OPEN
        : SchedulePersistenceStatus.CLOSED,
      notes: data.notes || null,
      createdAt: exception.createdAt,
      updatedAt: exception.updatedAt,
      practitioner,
      clinicRoom: null,
      clinicService: null,
    });
  }

  async findById(id: string): Promise<ScheduleEntity | null> {
    if (!isUuid(id)) {
      return null;
    }

    // 1. Check shift exception records
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
      const isLeave = exception.type === SHIFT_EXCEPTION_TYPE.LEAVE;

      return ScheduleRecordMapper.toEntity({
        id: exception.id,
        sessionId: exception.sessionId,
        practitionerId: exception.doctorId,
        scheduleDate: exception.serviceDate,
        sessionLabel: sDef?.label ?? null,
        sessionShift: (sDef?.code as SessionShiftType) ?? null,
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

    // 2. Check doctor assignment records
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
      const today = this.clinicTimeService.today();

      return ScheduleRecordMapper.toEntity({
        id: da.id,
        sessionId: da.sessionId,
        practitionerId: da.doctorId,
        scheduleDate: today,
        sessionLabel: da.sessionDef.label,
        sessionShift: da.sessionDef.code as SessionShiftType,
        startTime: da.sessionDef.defaultStartsAt,
        endTime: da.sessionDef.defaultEndsAt,
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

    // 3. Check master session definition records
    const sDef = await this.db.query.sessionDefs.findFirst({
      where: eq(sessionDefs.id, id),
      with: { schedules: true },
    });

    if (sDef) {
      const activeDa = await this.db.query.doctorAssignments.findFirst({
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

      const today = this.clinicTimeService.today();

      return ScheduleRecordMapper.toEntity({
        id: activeDa?.id || sDef.id,
        sessionId: sDef.id,
        practitionerId: activeDa?.doctorId || '',
        scheduleDate: today,
        sessionLabel: sDef.label,
        sessionShift: sDef.code as SessionShiftType,
        startTime: sDef.defaultStartsAt,
        endTime: sDef.defaultEndsAt,
        roomId: activeDa?.preferredRoomId || null,
        serviceId: activeDa?.categoryId || null,
        status: SchedulePersistenceStatus.OPEN,
        notes: null,
        createdAt: sDef.createdAt,
        updatedAt: sDef.updatedAt,
        practitioner: activeDa?.practitioner || null,
        clinicRoom: activeDa?.preferredRoom || null,
        clinicService: null,
      });
    }

    return null;
  }

  async findAll(
    limit = 20,
    offset = 0,
    filters?: ScheduleSessionFilter,
  ): Promise<ScheduleEntity[]> {
    const targetDate = filters?.date || this.clinicTimeService.today();
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
      const isLeave = ex?.type === SHIFT_EXCEPTION_TYPE.LEAVE;

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
        sessionShift: da.sessionDef.code as SessionShiftType,
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
    filters?: MySchedulesFilter,
  ): Promise<ScheduleEntity[]> {
    return this.resolvedMySchedulesQuery.execute(staffId, filters);
  }

  async findByPoliAndDate(
    poliklinikId: string,
    date: string,
  ): Promise<ScheduleEntity[]> {
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
    if (!isUuid(id)) {
      return null;
    }

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
            eq(shiftExceptions.type, SHIFT_EXCEPTION_TYPE.LEAVE),
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
            type: SHIFT_EXCEPTION_TYPE.LEAVE,
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
              eq(shiftExceptions.type, SHIFT_EXCEPTION_TYPE.LEAVE),
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
    if (!isUuid(id)) {
      throw new NotFoundException(`Format ID jadwal ${id} tidak valid.`);
    }

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

    const exception = await this.db.query.shiftExceptions.findFirst({
      where: eq(shiftExceptions.id, id),
    });
    if (exception) {
      await this.db.delete(shiftExceptions).where(eq(shiftExceptions.id, id));
      return true;
    }

    const da = await this.db.query.doctorAssignments.findFirst({
      where: eq(doctorAssignments.id, id),
    });
    if (da) {
      await this.db
        .update(doctorAssignments)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(doctorAssignments.id, id));
      return true;
    }

    return false;
  }
}

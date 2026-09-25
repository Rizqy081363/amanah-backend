import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
} from '@database/schema';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  DEFAULT_TARGET_QUOTA,
} from '@modules/schedules/domain/constants/schedule.constants';
import { count } from 'drizzle-orm';
import type { ScheduleEntity } from '@modules/schedules/domain/entities/schedule.entity';
import {
  AdminScheduleStatusRequest,
  SchedulePersistenceStatus,
  toAdminScheduleStatusRequest,
  toDaySessionPersistenceStatus,
} from '@modules/schedules/domain/schedule-status';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import {
  resolveDefaultSessionTimes,
  resolveSessionShift,
  SESSION_RECORD_RELATIONS,
} from '@modules/schedules/infrastructure/drizzle/queries/session-query-relations';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleSessionRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly conflictQuery: ScheduleConflictQuery,
  ) {}

  /**
   * Batch-counts active appointments per session ID.
   * Returns a Map<sessionId, count> for accurate bookedPatientCount,
   * replacing the broken `capacity - availableSlots` formula which
   * returns `capacity` when a session is CLOSED (availableSlots forced to 0).
   */
  private async getActiveAppointmentCountsBySessionIds(
    sessionIds: string[],
  ): Promise<Map<string, number>> {
    if (sessionIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        sessionId: appointments.scheduleSessionId,
        appointmentCount: count(appointments.id),
      })
      .from(appointments)
      .where(
        and(
          inArray(appointments.scheduleSessionId, sessionIds),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        ),
      )
      .groupBy(appointments.scheduleSessionId);

    const countMap = new Map<string, number>();
    for (const row of rows) {
      if (row.sessionId) {
        countMap.set(row.sessionId, Number(row.appointmentCount));
      }
    }
    return countMap;
  }

  /**
   * Patches bookedPatientCount and availableSlots on ScheduleEntity[]
   * using actual appointment counts from the appointments table.
   * This is necessary because when admin closes a session,
   * `availableSlots` is force-set to 0, making `capacity - availableSlots`
   * incorrectly report `capacity` as bookedPatientCount.
   */
  private patchBookedCountFromActualAppointments(
    entities: ScheduleEntity[],
    countMap: Map<string, number>,
  ): ScheduleEntity[] {
    return entities.map((entity) => {
      const actualCount = countMap.get(entity.id) ?? 0;
      return {
        ...entity,
        bookedPatientCount: actualCount,
        availableSlots: Math.max(0, (entity.capacity ?? 0) - actualCount),
      };
    });
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

    const { shift, defaultLabel } = resolveSessionShift({
      session: data.session,
      sessionShift: data.sessionShift,
    });
    const sessionLabel = data.sessionLabel || defaultLabel;
    const defaultTimes = resolveDefaultSessionTimes(shift);

    const targetDate =
      data.scheduleDate ||
      data.specificDate ||
      new Date().toISOString().split('T')[0];

    const defaultStartTime = data.startTime || defaultTimes.startTime;
    const defaultEndTime = data.endTime || defaultTimes.endTime;

    let roomId = data.roomId || null;
    if (!roomId && data.poliklinikId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.unitId, data.poliklinikId),
      });
      if (room) roomId = room.id;
    }

    const capacity = data.capacity ?? DEFAULT_TARGET_QUOTA;

    await this.conflictQuery.checkConflicts(
      practitionerId,
      targetDate,
      defaultStartTime,
      defaultEndTime,
      roomId,
    );

    const daySetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
        ),
      });

    const [record] = await this.db
      .insert(practitionerScheduleSessions)
      .values({
        practitionerId,
        daySettingId: daySetting?.id || null,
        roomId,
        serviceId: data.serviceId || null,
        scheduleDate: targetDate,
        sessionLabel,
        sessionShift: shift,
        startTime:
          defaultStartTime.length === 5
            ? `${defaultStartTime}:00`
            : defaultStartTime,
        endTime:
          defaultEndTime.length === 5 ? `${defaultEndTime}:00` : defaultEndTime,
        capacity,
        availableSlots: capacity,
        status: data.isAvailable
          ? SchedulePersistenceStatus.OPEN
          : SchedulePersistenceStatus.CLOSED,
        notes: data.notes || null,
      })
      .returning();

    return (await this.findById(record.id)) as ScheduleEntity;
  }

  async findById(id: string): Promise<ScheduleEntity | null> {
    const record = await this.db.query.practitionerScheduleSessions.findFirst({
      where: eq(practitionerScheduleSessions.id, id),
      with: SESSION_RECORD_RELATIONS,
    });

    if (!record) return null;
    const entity = ScheduleRecordMapper.toEntity(record);
    const countMap = await this.getActiveAppointmentCountsBySessionIds([id]);
    return this.patchBookedCountFromActualAppointments([entity], countMap)[0];
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
    const conditions: any[] = [];
    if (filters?.date) {
      conditions.push(
        eq(practitionerScheduleSessions.scheduleDate, filters.date),
      );
    }

    const records = await this.db.query.practitionerScheduleSessions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: [
        desc(practitionerScheduleSessions.scheduleDate),
        asc(practitionerScheduleSessions.startTime),
        desc(practitionerScheduleSessions.id),
      ],
      with: SESSION_RECORD_RELATIONS,
    });

    let result = records.map((r) => ScheduleRecordMapper.toEntity(r));

    if (filters?.poliklinikId) {
      result = result.filter((s) => s.poliklinikId === filters.poliklinikId);
    }
    if (filters?.staffId) {
      result = result.filter((s) => s.staffId === filters.staffId);
    }

    return result;
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

    const conditions: any[] = [
      eq(practitionerScheduleSessions.practitionerId, targetId),
    ];

    if (filters?.date) {
      conditions.push(
        eq(practitionerScheduleSessions.scheduleDate, filters.date),
      );
    }
    if (filters?.startDate) {
      conditions.push(
        gte(practitionerScheduleSessions.scheduleDate, filters.startDate),
      );
    }
    if (filters?.endDate) {
      conditions.push(
        lte(practitionerScheduleSessions.scheduleDate, filters.endDate),
      );
    }

    const records = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(...conditions),
      orderBy: [
        asc(practitionerScheduleSessions.scheduleDate),
        asc(practitionerScheduleSessions.startTime),
      ],
      with: SESSION_RECORD_RELATIONS,
    });

    const entities = records.map((r) => ScheduleRecordMapper.toEntity(r));
    const sessionIds = entities.map((e) => e.id);
    const countMap =
      await this.getActiveAppointmentCountsBySessionIds(sessionIds);
    return this.patchBookedCountFromActualAppointments(entities, countMap);
  }

  async findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]> {
    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(
        eq(practitionerScheduleSessions.scheduleDate, date),
        eq(practitionerScheduleSessions.status, SchedulePersistenceStatus.OPEN),
      ),
      with: SESSION_RECORD_RELATIONS,
    });

    return sessions
      .filter((s) => {
        if (!poliklinikId) return true;
        return (
          s.clinicRoom?.unitId === poliklinikId ||
          s.practitioner?.staffProfile?.primaryUnitId === poliklinikId
        );
      })
      .map((s) => ScheduleRecordMapper.toEntity(s));
  }

  async update(
    id: string,
    data: Partial<ScheduleEntity>,
  ): Promise<ScheduleEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    let targetDate = existing.scheduleDate || existing.specificDate!;
    if (data.scheduleDate || data.specificDate) {
      targetDate = (data.scheduleDate || data.specificDate)!;
      updateValues.scheduleDate = targetDate;
    }

    let startTime = existing.startTime!;
    if (data.startTime) {
      startTime = data.startTime;
      updateValues.startTime =
        startTime.length === 5 ? `${startTime}:00` : startTime;
    }

    let endTime = existing.endTime!;
    if (data.endTime) {
      endTime = data.endTime;
      updateValues.endTime = endTime.length === 5 ? `${endTime}:00` : endTime;
    }

    let roomId = existing.roomId;
    if (data.roomId !== undefined) {
      roomId = data.roomId;
      updateValues.roomId = roomId;
    }

    if (data.session || data.sessionShift || data.sessionLabel) {
      const { shift, defaultLabel } = resolveSessionShift({
        session: data.session,
        sessionShift: data.sessionShift,
      });
      updateValues.sessionLabel = data.sessionLabel || defaultLabel;
      updateValues.sessionShift = shift;
    }

    if (data.capacity !== undefined) {
      updateValues.capacity = data.capacity;
    }

    if (data.serviceId !== undefined) {
      updateValues.serviceId = data.serviceId;
    }

    if (data.status !== undefined) {
      const requestedStatus = toAdminScheduleStatusRequest(data.status);
      if (!requestedStatus) {
        throw new BadRequestException({
          code: 'INVALID_SCHEDULE_STATUS',
          message: 'status must use canonical values only: OPEN or CLOSED.',
          metadata: { status: data.status },
        });
      }
      const isOpen = requestedStatus === AdminScheduleStatusRequest.OPEN;
      updateValues.status = toDaySessionPersistenceStatus(requestedStatus);
      if (!isOpen) {
        updateValues.availableSlots = 0;
      } else if (
        existing.availableSlots === 0 ||
        existing.availableSlots === null
      ) {
        updateValues.availableSlots = sql`capacity`;
      }
    } else if (data.isAvailable !== undefined) {
      updateValues.status = data.isAvailable
        ? SchedulePersistenceStatus.OPEN
        : SchedulePersistenceStatus.CLOSED;
      if (!data.isAvailable) {
        updateValues.availableSlots = 0;
      } else if (
        existing.availableSlots === 0 ||
        existing.availableSlots === null
      ) {
        updateValues.availableSlots = sql`capacity`;
      }
    }

    if (data.notes !== undefined) {
      updateValues.notes = data.notes;
    }

    if (
      data.startTime ||
      data.endTime ||
      data.roomId !== undefined ||
      data.scheduleDate
    ) {
      const practitioner = await this.practitionerResolver.resolve(
        existing.staffId,
      );
      const practitionerId = practitioner ? practitioner.id : existing.staffId;
      await this.conflictQuery.checkConflicts(
        practitionerId,
        targetDate,
        startTime,
        endTime,
        roomId,
        id,
      );
    }

    const [updated] = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    return updated ? this.findById(updated.id) : null;
  }

  async toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null> {
    const existing = await this.findById(id);
    const updateValues: Record<string, any> = {
      status: isAvailable
        ? SchedulePersistenceStatus.OPEN
        : SchedulePersistenceStatus.CLOSED,
      updatedAt: new Date().toISOString(),
    };
    if (!isAvailable) {
      updateValues.availableSlots = 0;
    } else if (!existing || existing.availableSlots === 0) {
      updateValues.availableSlots = sql`capacity`;
    }

    const [record] = await this.db
      .update(practitionerScheduleSessions)
      .set(updateValues)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    return record ? this.findById(record.id) : null;
  }

  async delete(id: string): Promise<boolean> {
    const existingSession =
      await this.db.query.practitionerScheduleSessions.findFirst({
        where: eq(practitionerScheduleSessions.id, id),
      });

    if (!existingSession) {
      return false;
    }

    const sessStart =
      existingSession.startTime.length === 5
        ? `${existingSession.startTime}:00`
        : existingSession.startTime;
    const sessEnd =
      existingSession.endTime.length === 5
        ? `${existingSession.endTime}:00`
        : existingSession.endTime;

    const activeAppointments = await this.db.query.appointments.findMany({
      where: and(
        or(
          eq(appointments.scheduleSessionId, id),
          and(
            eq(appointments.practitionerId, existingSession.practitionerId),
            eq(appointments.scheduledDate, existingSession.scheduleDate),
            gte(appointments.scheduledStartTime, sessStart),
            lt(appointments.scheduledStartTime, sessEnd),
          ),
        ),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
      ),
    });

    if (activeAppointments.length > 0) {
      throw new ConflictException({
        code: 'SCHEDULE_HAS_ACTIVE_BOOKINGS',
        message: `Jadwal tidak dapat dihapus karena sudah memiliki ${activeAppointments.length} pasien terdaftar. Batalkan atau jadwalkan ulang janji temu pasien terlebih dahulu.`,
      });
    }

    const res = await this.db
      .delete(practitionerScheduleSessions)
      .where(eq(practitionerScheduleSessions.id, id))
      .returning();

    if (res.length > 0 && existingSession) {
      const remainingOpen =
        await this.db.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(
              practitionerScheduleSessions.practitionerId,
              existingSession.practitionerId,
            ),
            eq(
              practitionerScheduleSessions.scheduleDate,
              existingSession.scheduleDate,
            ),
            eq(
              practitionerScheduleSessions.status,
              SchedulePersistenceStatus.OPEN,
            ),
          ),
        });

      if (remainingOpen.length === 0) {
        await this.db
          .update(practitionerScheduleDaySettings)
          .set({
            leaveReason: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(
                practitionerScheduleDaySettings.practitionerId,
                existingSession.practitionerId,
              ),
              eq(
                practitionerScheduleDaySettings.scheduleDate,
                existingSession.scheduleDate,
              ),
              eq(practitionerScheduleDaySettings.isLeave, false),
            ),
          );
      }
    }

    return res.length > 0;
  }
}

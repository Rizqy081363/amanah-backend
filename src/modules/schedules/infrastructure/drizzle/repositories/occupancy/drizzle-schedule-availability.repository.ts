import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { generateEntityVersion } from '../../../../../../common/occ';
import { DRIZZLE_SOURCE } from '../../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../../database/drizzle/drizzle.provider';
import {
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
} from '../../../../../../database/schema';
import { CLINIC_TIMEZONE } from '../../../../domain/constants/schedule.constants';
import {
  SCHEDULE_CONTEXT_DEFINITIONS,
  type ScheduleContextDefinition,
} from '../../../../domain/constants/schedule-context.constants';
import {
  type ScheduleAvailabilityMutationResponse,
  type ScheduleContextEntity,
  type ScheduleEntity,
  type ScheduleProjectionEntity,
} from '../../../../domain/entities/schedule.entity';
import { ScheduleSlotFactory } from '../../../../domain/factories/schedule-slot.factory';
import {
  parseClockTime,
  projectScheduleIntervals,
  type ScheduleClosedReason,
} from '../../../../domain/schedule-projection';
import {
  isClosedScheduleStatus,
  SchedulePersistenceStatus,
} from '../../../../domain/schedule-status';
import { ScheduleContextResolver } from '../../../../domain/services/schedule-context-resolver';
import type { CreateAvailabilityDto } from '../../../../presentation/dto/create-availability.dto';
import type { ScheduleProjectionQueryDto } from '../../../../presentation/dto/schedule-projection-query.dto';
import type { UpdatePractitionerSchedulePolicyDto } from '../../../../presentation/dto/update-practitioner-schedule-policy.dto';
import { ScheduleRecordMapper } from '../../mappers/schedule-record.mapper';
import { AppointmentOccupationQuery } from '../../queries/appointment-occupation.query';
import { ScheduleConflictQuery } from '../../queries/schedule-conflict.query';
import { SchedulePolicyReader } from '../../queries/schedule-policy.reader';
import { PractitionerResolver } from '../../resolvers/practitioner.resolver';
import { RoomResolver } from '../../resolvers/room.resolver';

@Injectable()
export class DrizzleScheduleAvailabilityRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly roomResolver: RoomResolver,
    private readonly policyReader: SchedulePolicyReader,
    private readonly conflictQuery: ScheduleConflictQuery,
    private readonly occupationQuery: AppointmentOccupationQuery,
  ) {}

  private toScheduleContextEntity(
    practitionerId: string,
    date: string,
    context: ScheduleContextDefinition,
    policy: { durationMinutes: number; startPrecisionMinutes: number },
    durationEditableByCurrentUser: boolean,
  ): ScheduleContextEntity {
    return {
      contextId: context.contextId,
      contextLabel: context.contextLabel,
      sessionShift: context.sessionShift,
      date,
      practitionerId,
      boundaryStartTime: context.boundaryStartTime,
      boundaryEndTime: context.boundaryEndTime,
      allowedStartPrecisionMinutes: policy.startPrecisionMinutes,
      timezone: CLINIC_TIMEZONE,
      effectiveConsultationDurationMinutes: policy.durationMinutes,
      durationSource: 'PRACTITIONER_CONFIG',
      durationScope: 'practitioner-specific',
      durationEditableByCurrentUser,
    };
  }

  private validateProjectionRequest(
    context: ScheduleContextDefinition,
    selectedStartTime: string,
    policy: { durationMinutes: number; startPrecisionMinutes: number },
  ): void {
    const startMinutes = parseClockTime(selectedStartTime);
    const boundaryStart = parseClockTime(context.boundaryStartTime);
    const boundaryEnd = parseClockTime(context.boundaryEndTime);

    if (startMinutes < boundaryStart || startMinutes >= boundaryEnd) {
      throw new UnprocessableEntityException({
        code: 'START_OUTSIDE_BOUNDARY',
        message: 'Jam mulai berada di luar batas konteks jadwal yang dipilih.',
        metadata: {
          selectedStartTime,
          boundaryStartTime: context.boundaryStartTime,
          boundaryEndTime: context.boundaryEndTime,
        },
      });
    }

    if ((startMinutes - boundaryStart) % policy.startPrecisionMinutes !== 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_START_PRECISION',
        message: 'Jam mulai tidak sesuai presisi menit yang diizinkan backend.',
        metadata: {
          selectedStartTime,
          allowedStartPrecisionMinutes: policy.startPrecisionMinutes,
        },
      });
    }

    const capacity = Math.floor(
      (boundaryEnd - startMinutes) / policy.durationMinutes,
    );
    if (capacity < 1) {
      throw new UnprocessableEntityException({
        code: 'DURATION_LEAVES_NO_CAPACITY',
        message:
          'Jam mulai dan durasi konsultasi tidak menyisakan kapasitas interval.',
        metadata: {
          selectedStartTime,
          boundaryEndTime: context.boundaryEndTime,
          effectiveConsultationDurationMinutes: policy.durationMinutes,
        },
      });
    }
  }

  async getScheduleContexts(
    staffId: string,
    date: string,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleContextEntity[]> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const policy = await this.policyReader.getPolicy(practitioner);
    return SCHEDULE_CONTEXT_DEFINITIONS.map((context) =>
      this.toScheduleContextEntity(
        practitioner.id,
        date,
        context,
        policy,
        durationEditableByCurrentUser,
      ),
    );
  }

  async projectAvailability(
    staffId: string,
    query: ScheduleProjectionQueryDto,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleProjectionEntity> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const context = ScheduleContextResolver.resolve(query.scheduleContextId);
    const policy = await this.policyReader.getPolicy(practitioner);
    this.validateProjectionRequest(context, query.startTime, policy);

    const fillShift = query.fillShift === true;

    const timing = ScheduleSlotFactory.calculateSessionTiming(
      context,
      query.startTime,
      policy,
      {
        endTime: query.endTime,
        slotsCount: query.slotsCount,
        fillShift,
      },
    );

    const projection = await this.buildProjection({
      practitionerId: practitioner.id,
      date: query.date,
      context,
      selectedStartTime: query.startTime,
      boundaryEndTime: timing.endTime,
      policy,
      durationEditableByCurrentUser,
    });

    projection.remainingShiftSlots = timing.remainingShiftSlots;
    return projection;
  }

  async createAvailability(
    staffId: string,
    body: CreateAvailabilityDto,
    options: {
      userId: string;
      durationEditableByCurrentUser: boolean;
    },
  ): Promise<ScheduleAvailabilityMutationResponse> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const context = ScheduleContextResolver.resolve(body.scheduleContextId);
    const policy = await this.policyReader.getPolicy(practitioner);

    const timing = ScheduleSlotFactory.calculateSessionTiming(
      context,
      body.startTime,
      policy,
      {
        endTime: body.endTime,
        slotsCount: body.slotsCount,
        fillShift: body.fillShift === true,
      },
    );

    const preview = await this.projectAvailability(
      practitioner.id,
      {
        date: body.date,
        scheduleContextId: body.scheduleContextId,
        startTime: body.startTime,
        endTime: timing.endTime,
        slotsCount: timing.capacity,
        fillShift: false,
        roomId: body.roomId,
        serviceId: body.serviceId,
      },
      options.durationEditableByCurrentUser,
    );

    if (
      preview.intervals.some((interval) => interval.closedReason === 'LEAVE')
    ) {
      throw new ConflictException({
        code: 'DATE_CLOSED',
        message:
          'Availability tidak dapat dibuat karena tanggal ini ditutup untuk cuti.',
        metadata: {
          date: body.date,
          closedReason: 'LEAVE',
        },
      });
    }

    const roomId = await this.roomResolver.resolveRoomId(
      body.roomId,
      body.poliklinikId,
    );

    await this.conflictQuery.checkConflicts(
      practitioner.id,
      body.date,
      body.startTime,
      timing.endTime,
      roomId,
    );

    const daySetting =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitioner.id),
          eq(practitionerScheduleDaySettings.scheduleDate, body.date),
        ),
      });

    const [record] = await this.db
      .insert(practitionerScheduleSessions)
      .values({
        practitionerId: practitioner.id,
        daySettingId: daySetting?.id || null,
        roomId,
        serviceId: body.serviceId || null,
        scheduleDate: body.date,
        sessionLabel: context.contextLabel,
        sessionShift: context.sessionShift,
        startTime: `${body.startTime}:00`,
        endTime: `${timing.endTime}:00`,
        capacity: timing.capacity,
        availableSlots: preview.intervals.filter(
          (interval) => interval.status === 'OPEN',
        ).length,
        status: SchedulePersistenceStatus.OPEN,
        notes: body.notes || null,
      })
      .returning();

    const schedule = await this.findSessionById(record.id);
    if (!schedule) {
      throw new NotFoundException(
        'Sesi jadwal gagal ditemukan setelah dibuat.',
      );
    }

    const projection = await this.buildProjectionForSession(
      record.id,
      options.durationEditableByCurrentUser,
    );
    projection.remainingShiftSlots = timing.remainingShiftSlots;

    return {
      schedule,
      projection,
    };
  }

  async updatePractitionerSchedulePolicy(
    id: string,
    body: UpdatePractitionerSchedulePolicyDto,
  ): Promise<ScheduleContextEntity[]> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const [updated] = await this.db
      .update(practitioners)
      .set({
        consultationDurationMinutes: body.consultationDurationMinutes,
        startPrecisionMinutes:
          body.startPrecisionMinutes ?? practitioner.startPrecisionMinutes ?? 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(practitioners.id, practitioner.id))
      .returning();

    return this.getScheduleContexts(
      updated.id,
      new Date().toISOString().slice(0, 10),
      true,
    );
  }

  async buildProjectionForSession(
    sessionId: string,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleProjectionEntity> {
    const session = await this.db.query.practitionerScheduleSessions.findFirst({
      where: eq(practitionerScheduleSessions.id, sessionId),
      with: {
        practitioner: true,
      },
    });

    if (!session?.practitioner) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan`,
      );
    }

    const context =
      SCHEDULE_CONTEXT_DEFINITIONS.find(
        (definition) => definition.sessionShift === session.sessionShift,
      ) ?? SCHEDULE_CONTEXT_DEFINITIONS[1];
    const policy = await this.policyReader.getPolicy(session.practitioner);
    const closedReason = isClosedScheduleStatus(session.status)
      ? ('SCHEDULE_CLOSED' as const)
      : undefined;

    return this.buildProjection({
      practitionerId: session.practitionerId,
      scheduleId: session.id,
      date: session.scheduleDate,
      context,
      selectedStartTime: session.startTime.slice(0, 5),
      boundaryEndTime: session.endTime.slice(0, 5),
      policy,
      durationEditableByCurrentUser,
      closedReason,
      updatedAt: session.updatedAt,
    });
  }

  async buildProjection(params: {
    practitionerId: string;
    scheduleId?: string;
    date: string;
    context: ScheduleContextDefinition;
    selectedStartTime: string;
    boundaryEndTime: string;
    policy: { durationMinutes: number; startPrecisionMinutes: number };
    durationEditableByCurrentUser: boolean;
    closedReason?: ScheduleClosedReason;
    updatedAt?: string | null;
  }): Promise<ScheduleProjectionEntity> {
    const dayClosedReason =
      params.closedReason ??
      (await this.occupationQuery.getDayClosedReason(
        params.practitionerId,
        params.date,
      ));
    const appointments = await this.occupationQuery.getAppointmentOccupations({
      practitionerId: params.practitionerId,
      date: params.date,
      sessionId: params.scheduleId,
    });
    const projected = projectScheduleIntervals({
      scheduleId: params.scheduleId,
      selectedStartTime: params.selectedStartTime,
      boundaryEndTime: params.boundaryEndTime,
      durationMinutes: params.policy.durationMinutes,
      appointments,
      closedReason: dayClosedReason,
    });

    return {
      scheduleId: params.scheduleId,
      practitionerId: params.practitionerId,
      date: params.date,
      scheduleContextId: params.context.contextId,
      contextLabel: params.context.contextLabel,
      selectedStartTime: params.selectedStartTime,
      boundaryStartTime: params.context.boundaryStartTime,
      boundaryEndTime: params.boundaryEndTime,
      shiftBoundary: {
        startTime: params.context.boundaryStartTime,
        endTime: params.boundaryEndTime,
      },
      projectedEndTime: projected.projectedEndTime,
      effectiveConsultationDurationMinutes: params.policy.durationMinutes,
      durationSource: 'PRACTITIONER_CONFIG',
      durationScope: 'practitioner-specific',
      durationEditableByCurrentUser: params.durationEditableByCurrentUser,
      allowedStartPrecisionMinutes: params.policy.startPrecisionMinutes,
      timezone: CLINIC_TIMEZONE,
      capacity: projected.capacity,
      remainingShiftSlots: Math.max(
        0,
        Math.floor(
          (parseClockTime(params.context.boundaryEndTime) -
            parseClockTime(projected.projectedEndTime)) /
            params.policy.durationMinutes,
        ),
      ),
      intervals: projected.intervals,
      version: params.updatedAt
        ? generateEntityVersion(params.updatedAt)
        : undefined,
      updatedAt: params.updatedAt ?? null,
    };
  }

  private async findSessionById(id: string): Promise<ScheduleEntity | null> {
    const record = await this.db.query.practitionerScheduleSessions.findFirst({
      where: eq(practitionerScheduleSessions.id, id),
      with: {
        practitioner: {
          with: {
            staffProfile: {
              with: {
                clinicUnit: true,
                user: true,
              },
            },
          },
        },
        clinicRoom: {
          with: {
            clinicUnit: true,
          },
        },
        clinicService: true,
      },
    });

    return record ? ScheduleRecordMapper.toEntity(record) : null;
  }
}

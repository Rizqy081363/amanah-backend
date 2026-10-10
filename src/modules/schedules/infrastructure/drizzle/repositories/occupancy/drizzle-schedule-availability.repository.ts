import { generateEntityVersion } from '@common/occ';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  practitioners,
  sessionDefs,
} from '@database/schema';
import { ClinicTimeService } from '@common/time/clinic-time.service';
import {
  SCHEDULE_CONTEXT_DEFINITIONS,
  type ScheduleContextDefinition,
} from '@modules/schedules/domain/constants/schedule-context.constants';
import {
  type ScheduleAvailabilityMutationResponse,
  type ScheduleContextEntity,
  type ScheduleEntity,
  type ScheduleProjectionEntity,
} from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleSessionFactory } from '@modules/schedules/domain/factories/schedule-session.factory';
import {
  parseClockTime,
  projectScheduleProjection,
  type ScheduleClosedReason,
} from '@modules/schedules/domain/schedule-projection';
import {
  isClosedScheduleStatus,
  SchedulePersistenceStatus,
} from '@modules/schedules/domain/schedule-status';
import { ScheduleContextResolver } from '@modules/schedules/domain/services/schedule-context-resolver';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import { AppointmentOccupationQuery } from '@modules/schedules/infrastructure/drizzle/queries/appointment-occupation.query';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { RoomResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/room.resolver';
import type { ScheduleProjectionQueryDto } from '@modules/schedules/presentation/dto/schedule-projection-query.dto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

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
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  private getTimezone(): string {
    return (
      this.clinicTimeService?.getTimezone() ||
      process.env.CLINIC_TIMEZONE ||
      'UTC'
    );
  }

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
      timezone: this.getTimezone(),
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

    const remainingMinutes = boundaryEnd - startMinutes;
    if (remainingMinutes < policy.durationMinutes) {
      throw new UnprocessableEntityException({
        code: 'DURATION_EXCEEDS_BOUNDARY',
        message:
          'Jam mulai dan durasi konsultasi melebihi batas shift.',
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

    const timing = ScheduleSessionFactory.calculateSessionTiming(
      context,
      query.startTime,
      policy,
      {
        endTime: query.endTime,
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

    return projection;
  }

  async buildProjectionForSession(
    sessionId: string,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleProjectionEntity> {
    const sessionDef = await this.db.query.sessionDefs.findFirst({
      where: eq(sessionDefs.id, sessionId),
    });

    if (!sessionDef) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan`,
      );
    }

    const context =
      SCHEDULE_CONTEXT_DEFINITIONS.find(
        (definition) => definition.sessionShift === sessionDef.code,
      ) ?? SCHEDULE_CONTEXT_DEFINITIONS[1];
    const clinicPolicy = await this.policyReader.getClinicSchedulePolicy();

    return this.buildProjection({
      practitionerId: sessionId,
      scheduleId: sessionDef.id,
      date: new Date().toISOString().split('T')[0],
      context,
      selectedStartTime: sessionDef.defaultStartsAt.slice(0, 5),
      boundaryEndTime: sessionDef.defaultEndsAt.slice(0, 5),
      policy: clinicPolicy,
      durationEditableByCurrentUser,
      updatedAt: sessionDef.updatedAt ?? null,
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
    const projected = projectScheduleProjection({
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
      timezone: this.getTimezone(),
      intervals: projected.intervals,
      version: params.updatedAt
        ? generateEntityVersion(params.updatedAt)
        : undefined,
      updatedAt: params.updatedAt ?? null,
    };
  }
}

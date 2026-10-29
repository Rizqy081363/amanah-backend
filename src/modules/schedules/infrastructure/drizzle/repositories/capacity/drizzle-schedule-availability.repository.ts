import { generateEntityVersion } from '@common/occ';
import { ClinicTimeService } from '@common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import { sessionDefs } from '@database/schema';
import { type ScheduleContextDefinition } from '@modules/schedules/domain/constants/schedule-context.constants';
import {
  type ScheduleContextEntity,
  type ScheduleProjectionEntity,
} from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleSessionFactory } from '@modules/schedules/domain/factories/schedule-session.factory';
import {
  parseClockTime,
  projectScheduleProjection,
  type ScheduleClosedReason,
} from '@modules/schedules/domain/schedule-projection';
import { AppointmentOccupationQuery } from '@modules/schedules/infrastructure/drizzle/queries/appointment-occupation.query';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { ScheduleProjectionQueryDto } from '@modules/schedules/presentation/dto/schedule-projection-query.dto';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { asc, eq, or } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleAvailabilityRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly policyReader: SchedulePolicyReader,
    private readonly occupationQuery: AppointmentOccupationQuery,
    private readonly clinicTimeService: ClinicTimeService,
  ) {}

  private getTimezone(): string {
    return this.clinicTimeService.getTimezone();
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
        message: 'Jam mulai dan durasi konsultasi melebihi batas shift.',
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

    const [sessionList, policy] = await Promise.all([
      this.db.query.sessionDefs.findMany({
        where: eq(sessionDefs.isActive, true),
        orderBy: [asc(sessionDefs.sortOrder)],
      }),
      this.policyReader.getPolicy(practitioner),
    ]);

    return sessionList.map((sDef) => {
      const boundaryStartTime = (sDef.defaultStartsAt || '00:00').slice(0, 5);
      const boundaryEndTime = (sDef.defaultEndsAt || '24:00').slice(0, 5);
      const label = sDef.label || sDef.code;
      const context: ScheduleContextDefinition = {
        shift: sDef.code,
        sessionShift: sDef.code,
        contextId: sDef.id,
        label,
        contextLabel: label,
        boundaryStartTime,
        boundaryEndTime,
        boundaryStartMinutes: parseClockTime(boundaryStartTime),
        boundaryEndMinutes: parseClockTime(boundaryEndTime),
        aliases: [sDef.code],
      };
      return this.toScheduleContextEntity(
        practitioner.id,
        date,
        context,
        policy,
        durationEditableByCurrentUser,
      );
    });
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

    const sessionDef = await this.db.query.sessionDefs.findFirst({
      where: or(
        eq(sessionDefs.id, query.scheduleContextId),
        eq(sessionDefs.code, query.scheduleContextId),
      ),
    });

    const boundaryStartTime = (sessionDef?.defaultStartsAt || '00:00').slice(
      0,
      5,
    );
    const boundaryEndTime = (sessionDef?.defaultEndsAt || '24:00').slice(0, 5);
    const label =
      sessionDef?.label || sessionDef?.code || query.scheduleContextId;

    const context: ScheduleContextDefinition = {
      shift: sessionDef?.code || query.scheduleContextId,
      sessionShift: sessionDef?.code || query.scheduleContextId,
      contextId: sessionDef?.id || query.scheduleContextId,
      label,
      contextLabel: label,
      boundaryStartTime,
      boundaryEndTime,
      boundaryStartMinutes: parseClockTime(boundaryStartTime),
      boundaryEndMinutes: parseClockTime(boundaryEndTime),
      aliases: [sessionDef?.code || query.scheduleContextId],
    };

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

    const boundaryStartTime = (sessionDef.defaultStartsAt || '00:00').slice(
      0,
      5,
    );
    const boundaryEndTime = (sessionDef.defaultEndsAt || '24:00').slice(0, 5);
    const label = sessionDef.label || sessionDef.code;

    const context: ScheduleContextDefinition = {
      shift: sessionDef.code,
      sessionShift: sessionDef.code,
      contextId: sessionDef.id,
      label,
      contextLabel: label,
      boundaryStartTime,
      boundaryEndTime,
      boundaryStartMinutes: parseClockTime(boundaryStartTime),
      boundaryEndMinutes: parseClockTime(boundaryEndTime),
      aliases: [sessionDef.code],
    };

    const clinicPolicy = await this.policyReader.getClinicSchedulePolicy();

    return this.buildProjection({
      practitionerId: sessionId,
      scheduleId: sessionDef.id,
      date: new Date().toISOString().split('T')[0],
      context,
      selectedStartTime: boundaryStartTime,
      boundaryEndTime: boundaryEndTime,
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
      nominalCapacity: projected.nominalCapacity,
      capacity: projected.nominalCapacity,
      isClosed: projected.isClosed,
      closedReason: projected.closedReason,
      intervals: projected.intervals,
      version: params.updatedAt
        ? generateEntityVersion(params.updatedAt)
        : undefined,
      updatedAt: params.updatedAt ?? null,
    };
  }
}

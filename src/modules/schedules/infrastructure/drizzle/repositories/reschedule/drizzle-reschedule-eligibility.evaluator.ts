import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  doctorAssignments,
  sessionDefs,
  shiftExceptions,
} from '@database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '@modules/schedules/domain/constants/schedule.constants';
import { formatSessionTitle } from '@modules/schedules/domain/constants/schedule-shift.constants';
import {
  type RescheduleEligibilityEntity,
  type RescheduleSourceSessionInfo,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleSessionFactory } from '@modules/schedules/domain/factories/schedule-session.factory';
import { resolveSessionOperationalStatus } from '@modules/schedules/domain/schedule-status';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { CheckRescheduleEligibilityQueryDto } from '@modules/schedules/presentation/dto/check-reschedule-eligibility-query.dto';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';

@Injectable()
export class DrizzleRescheduleEligibilityEvaluator {
  private readonly practitionerResolver: PractitionerResolver;
  private readonly conflictQuery: ScheduleConflictQuery;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional() practitionerResolver?: PractitionerResolver,
    @Optional() conflictQuery?: ScheduleConflictQuery,
  ) {
    this.practitionerResolver =
      practitionerResolver ?? new PractitionerResolver(db);
    this.conflictQuery = conflictQuery ?? new ScheduleConflictQuery(db);
  }

  async evaluate(
    id: string,
    sessionId: string,
    query: CheckRescheduleEligibilityQueryDto,
  ): Promise<RescheduleEligibilityEntity> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const sessionDef = await this.db.query.sessionDefs.findFirst({
      where: eq(sessionDefs.id, sessionId),
    });

    const assignment = sessionDef
      ? null
      : await this.db.query.doctorAssignments.findFirst({
          where: and(
            eq(doctorAssignments.id, sessionId),
            eq(doctorAssignments.doctorId, practitioner.id),
          ),
          with: {
            sessionDef: true,
          },
        });

    const effectiveSessionDef = sessionDef ?? assignment?.sessionDef;
    if (!effectiveSessionDef) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    const sourceDate =
      (query as any).sourceDate ||
      query.targetDate ||
      new Date().toISOString().split('T')[0];
    const sessStart = `${effectiveSessionDef.defaultStartsAt.slice(0, 5)}:00`;
    const sessEnd = `${effectiveSessionDef.defaultEndsAt.slice(0, 5)}:00`;

    const [sourceLeave, activeAppts] = await Promise.all([
      this.db.query.shiftExceptions.findFirst({
        where: and(
          eq(shiftExceptions.doctorId, practitioner.id),
          eq(shiftExceptions.serviceDate, sourceDate),
          eq(shiftExceptions.type, 'leave'),
        ),
      }),
      this.db.query.appointments.findMany({
        where: and(
          eq(appointments.practitionerId, practitioner.id),
          eq(appointments.scheduledDate, sourceDate),
          gte(appointments.scheduledStartTime, sessStart),
          lt(appointments.scheduledStartTime, sessEnd),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        ),
      }),
    ]);

    const isSourceLeave = Boolean(sourceLeave);
    const sourceStatus = resolveSessionOperationalStatus({
      isClosedForLeave: isSourceLeave,
      persistedStatus: 'open',
    });
    const isSourceClosed = sourceStatus === ScheduleOperationalStatus.CLOSED;

    let isSourceEligible = true;
    let rejectionReason: string | null = null;

    if (isSourceClosed) {
      isSourceEligible = false;
      rejectionReason =
        'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule.';
    } else if (isSourceLeave) {
      isSourceEligible = false;
      rejectionReason =
        'Sesi berstatus Cuti. Cuti dokter tidak dapat di-reschedule.';
    }

    let roomName = 'Belum Ditentukan';
    const effectiveRoomId =
      assignment?.preferredRoomId || practitioner.defaultRoomId || null;
    if (effectiveRoomId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.id, effectiveRoomId),
      });
      if (room) {
        roomName = `${room.name}${room.location ? `, ${room.location}` : ''}`;
      }
    }

    const sourceSessionInfo: RescheduleSourceSessionInfo = {
      id: effectiveSessionDef.id,
      scheduleDate: sourceDate,
      startTime: effectiveSessionDef.defaultStartsAt.slice(0, 5),
      endTime: effectiveSessionDef.defaultEndsAt.slice(0, 5),
      timeRange: `${effectiveSessionDef.defaultStartsAt.slice(0, 5)} - ${effectiveSessionDef.defaultEndsAt.slice(0, 5)} WIB`,
      status: 'open',
      statusLabel: sourceStatus,
      sessionLabel: formatSessionTitle(effectiveSessionDef.code),
      sessionShift: effectiveSessionDef.code,
      roomName,
      activeAppointmentsCount: activeAppts.length,
      isSourceEligible,
      rejectionReason,
    };

    const targetValidation = {
      evaluated: false,
      targetDate: query.targetDate || null,
      targetStartTime: query.targetStartTime || null,
      projectedEndTime: null as string | null,
      targetRoomId: query.targetRoomId || null,
      targetRoomName: null as string | null,
      isTargetEligible: true,
      conflictCode: null as string | null,
      conflictMessage: null as string | null,
      conflictMetadata: null as Record<string, any> | null,
    };

    if (query.targetDate && query.targetStartTime) {
      targetValidation.evaluated = true;

      try {
        const targetContext = ScheduleSessionFactory.resolveShiftFromClockTime(
          query.targetStartTime,
        );
        const durationMinutes =
          practitioner.consultationDurationMinutes &&
          practitioner.consultationDurationMinutes > 0
            ? practitioner.consultationDurationMinutes
            : 30;

        const timing = ScheduleSessionFactory.calculateSessionTiming(
          targetContext,
          query.targetStartTime,
          { durationMinutes },
        );

        const targetEndTime = timing.endTime;
        targetValidation.projectedEndTime = targetEndTime;

        const targetRoomId = query.targetRoomId || effectiveRoomId || null;
        targetValidation.targetRoomId = targetRoomId;

        if (targetRoomId) {
          const room = await this.db.query.clinicRooms.findFirst({
            where: eq(clinicRooms.id, targetRoomId),
          });
          if (room) {
            targetValidation.targetRoomName = `${room.name}${room.location ? `, ${room.location}` : ''}`;
          }
        }

        const targetLeave = await this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.doctorId, practitioner.id),
            eq(shiftExceptions.serviceDate, query.targetDate),
            eq(shiftExceptions.type, 'leave'),
          ),
        });

        if (targetLeave) {
          targetValidation.isTargetEligible = false;
          targetValidation.conflictCode = 'DATE_CLOSED';
          targetValidation.conflictMessage =
            'Jadwal tidak dapat di-reschedule karena dokter tercatat sedang cuti pada tanggal target.';
          targetValidation.conflictMetadata = {
            targetDate: query.targetDate,
            closedReason: 'LEAVE',
          };
        } else {
          await this.conflictQuery.checkConflicts(
            practitioner.id,
            query.targetDate,
            query.targetStartTime,
            targetEndTime,
            targetRoomId,
            sessionId,
          );
        }
      } catch (err: any) {
        targetValidation.isTargetEligible = false;
        targetValidation.conflictCode =
          err.response?.code || err.code || 'CONFLICT';
        targetValidation.conflictMessage =
          err.response?.message || err.message || 'Konflik jadwal terdeteksi';
        targetValidation.conflictMetadata = err.response?.metadata || null;
      }
    }

    const isEligible =
      isSourceEligible &&
      (!targetValidation.evaluated || targetValidation.isTargetEligible);

    let actionableGuidance: string;
    if (!isSourceEligible) {
      actionableGuidance = rejectionReason!;
    } else if (
      targetValidation.evaluated &&
      !targetValidation.isTargetEligible
    ) {
      actionableGuidance = targetValidation.conflictMessage!;
    } else if (
      targetValidation.evaluated &&
      targetValidation.isTargetEligible
    ) {
      actionableGuidance =
        'Sesi dan target waktu memenuhi syarat untuk di-reschedule. Silakan lanjutkan konfirmasi.';
    } else {
      actionableGuidance =
        'Sesi memenuhi syarat untuk di-reschedule. Silakan tentukan tanggal dan jam target baru.';
    }

    const practitionerName =
      practitioner.staffProfile?.fullName ||
      practitioner.displayName ||
      '';

    return {
      sessionId: effectiveSessionDef.id,
      practitionerId: practitioner.id,
      practitionerName,
      isEligible,
      sourceSession: sourceSessionInfo,
      targetValidation,
      actionableGuidance,
    };
  }
}

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, inArray, lt, lte, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
} from '../../../../../../database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '../../../../domain/constants/schedule.constants';
import {
  type RescheduleEligibilityEntity,
  type RescheduleSourceSessionInfo,
  ScheduleOperationalStatus,
} from '../../../../domain/entities/schedule.entity';
import { ScheduleSlotFactory } from '../../../../domain/factories/schedule-slot.factory';
import {
  formatClockTime,
  parseClockTime,
} from '../../../../domain/schedule-projection';
import { resolveSessionOperationalStatus } from '../../../../domain/schedule-status';
import { ScheduleContextResolver } from '../../../../domain/services/schedule-context-resolver';
import type { CheckRescheduleEligibilityQueryDto } from '../../../../presentation/dto/check-reschedule-eligibility-query.dto';
import { ScheduleConflictQuery } from '../../queries/schedule-conflict.query';
import { PractitionerResolver } from '../../resolvers/practitioner.resolver';

@Injectable()
export class DrizzleRescheduleEligibilityEvaluator {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly conflictQuery: ScheduleConflictQuery,
  ) {}

  async evaluate(
    id: string,
    sessionId: string,
    query: CheckRescheduleEligibilityQueryDto,
  ): Promise<RescheduleEligibilityEntity> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const session = await this.db.query.practitionerScheduleSessions.findFirst({
      where: and(
        eq(practitionerScheduleSessions.id, sessionId),
        eq(practitionerScheduleSessions.practitionerId, practitioner.id),
      ),
      with: {
        clinicRoom: true,
      },
    });

    if (!session) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    const sourceDate = session.scheduleDate;
    const sessStart =
      session.startTime.length === 5
        ? `${session.startTime}:00`
        : session.startTime;
    const sessEnd =
      session.endTime.length === 5 ? `${session.endTime}:00` : session.endTime;

    const [sourceDaySetting, sourceLeave, activeAppts] = await Promise.all([
      this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitioner.id),
          eq(practitionerScheduleDaySettings.scheduleDate, sourceDate),
        ),
      }),
      this.db.query.practitionerLeavePeriods.findFirst({
        where: and(
          eq(practitionerLeavePeriods.practitionerId, practitioner.id),
          lte(practitionerLeavePeriods.startDate, sourceDate),
          gte(practitionerLeavePeriods.endDate, sourceDate),
        ),
      }),
      this.db.query.appointments.findMany({
        where: and(
          or(
            eq(appointments.scheduleSessionId, sessionId),
            and(
              eq(appointments.practitionerId, practitioner.id),
              eq(appointments.scheduledDate, sourceDate),
              gte(appointments.scheduledStartTime, sessStart),
              lt(appointments.scheduledStartTime, sessEnd),
            ),
          ),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        ),
      }),
    ]);

    const isSourceCuti = Boolean(sourceDaySetting?.isLeave || sourceLeave);
    const sourceStatus = resolveSessionOperationalStatus({
      isClosedForLeave: isSourceCuti,
      availableSlots: session.availableSlots ?? 0,
      persistedStatus: session.status,
    });
    const isSourceClosed = sourceStatus === ScheduleOperationalStatus.CLOSED;

    let isSourceEligible = true;
    let rejectionReason: string | null = null;

    if (isSourceClosed) {
      isSourceEligible = false;
      rejectionReason =
        'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.';
    } else if (isSourceCuti) {
      isSourceEligible = false;
      rejectionReason =
        'Sesi berstatus Cuti. Cuti dokter tidak dapat di-reschedule.';
    }

    let roomName = 'Belum Ditentukan';
    if (session.clinicRoom) {
      roomName = `${session.clinicRoom.name}${session.clinicRoom.location ? `, ${session.clinicRoom.location}` : ''}`;
    } else if (session.roomId || practitioner.defaultRoomId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(
          clinicRooms.id,
          (session.roomId || practitioner.defaultRoomId)!,
        ),
      });
      if (room) {
        roomName = `${room.name}${room.location ? `, ${room.location}` : ''}`;
      }
    }

    const sourceSessionInfo: RescheduleSourceSessionInfo = {
      id: session.id,
      scheduleDate: session.scheduleDate,
      startTime: session.startTime.slice(0, 5),
      endTime: session.endTime.slice(0, 5),
      timeRange: `${session.startTime.slice(0, 5)} - ${session.endTime.slice(0, 5)} WIB`,
      status: session.status,
      statusLabel: sourceStatus,
      sessionLabel: session.sessionLabel || 'Sesi Praktik',
      sessionShift: session.sessionShift || 'morning',
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

      const targetContextId = ScheduleSlotFactory.resolveShiftFromClockTime(
        query.targetStartTime,
      ).contextId;
      const startMin = parseClockTime(query.targetStartTime);

      const sessionDurationMinutes =
        parseClockTime(session.endTime) - parseClockTime(session.startTime);
      const targetEndMinutes = startMin + sessionDurationMinutes;
      const targetEndTime = formatClockTime(targetEndMinutes);
      targetValidation.projectedEndTime = targetEndTime;

      const targetRoomId =
        query.targetRoomId ||
        session.roomId ||
        practitioner.defaultRoomId ||
        null;
      targetValidation.targetRoomId = targetRoomId;

      if (targetRoomId) {
        const room = await this.db.query.clinicRooms.findFirst({
          where: eq(clinicRooms.id, targetRoomId),
        });
        if (room) {
          targetValidation.targetRoomName = `${room.name}${room.location ? `, ${room.location}` : ''}`;
        }
      }

      try {
        const [targetDaySetting, targetLeave] = await Promise.all([
          this.db.query.practitionerScheduleDaySettings.findFirst({
            where: and(
              eq(
                practitionerScheduleDaySettings.practitionerId,
                practitioner.id,
              ),
              eq(
                practitionerScheduleDaySettings.scheduleDate,
                query.targetDate,
              ),
            ),
          }),
          this.db.query.practitionerLeavePeriods.findFirst({
            where: and(
              eq(practitionerLeavePeriods.practitionerId, practitioner.id),
              lte(practitionerLeavePeriods.startDate, query.targetDate),
              gte(practitionerLeavePeriods.endDate, query.targetDate),
            ),
          }),
        ]);

        if (targetDaySetting?.isLeave || targetLeave) {
          targetValidation.isTargetEligible = false;
          targetValidation.conflictCode = 'DATE_CLOSED';
          targetValidation.conflictMessage =
            'Jadwal tidak dapat di-reschedule karena dokter tercatat sedang cuti pada tanggal target.';
          targetValidation.conflictMetadata = {
            targetDate: query.targetDate,
            closedReason: 'LEAVE',
          };
        } else {
          const context = ScheduleContextResolver.resolve(targetContextId);
          const boundaryStart = parseClockTime(context.boundaryStartTime);
          const boundaryEnd = parseClockTime(context.boundaryEndTime);

          if (startMin < boundaryStart || startMin >= boundaryEnd) {
            targetValidation.isTargetEligible = false;
            targetValidation.conflictCode = 'START_OUTSIDE_BOUNDARY';
            targetValidation.conflictMessage = `Jam mulai (${query.targetStartTime}) berada di luar batas operasional shift ${context.contextLabel} (${context.boundaryStartTime} - ${context.boundaryEndTime} WIB).`;
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
      'Dokter Amanah';

    return {
      sessionId: session.id,
      practitionerId: practitioner.id,
      practitionerName,
      isEligible,
      sourceSession: sourceSessionInfo,
      targetValidation,
      actionableGuidance,
    };
  }
}

import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicRooms,
  shiftExceptions,
} from '@database/schema';
import { SCHEDULE_CONTEXT_DEFINITIONS } from '@modules/schedules/domain/constants/schedule-context.constants';
import {
  type ScheduleOccupancyOverviewData,
  type ScheduleShiftOccupancyEntity,
} from '@modules/schedules/domain/entities/schedule.entity';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { ScheduleOccupancyQueryDto } from '@modules/schedules/presentation/dto/schedule-occupancy-query.dto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleOccupancyRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly policyReader: SchedulePolicyReader,
  ) {}

  async getOccupancyOverview(
    staffId: string,
    query: ScheduleOccupancyQueryDto,
  ): Promise<ScheduleOccupancyOverviewData> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const practitionerId = practitioner.id;
    const practitionerName =
      practitioner.staffProfile?.fullName ||
      practitioner.displayName ||
      'Dokter';
    const policy = await this.policyReader.getPolicy(practitioner);
    const durationMinutes = policy.durationMinutes;

    // 1. Check if doctor is on leave on target date via shiftExceptions
    const activeLeave = await this.db.query.shiftExceptions.findFirst({
      where: and(
        eq(shiftExceptions.doctorId, practitionerId),
        eq(shiftExceptions.serviceDate, query.date),
        eq(shiftExceptions.type, 'leave'),
      ),
    });

    const isCuti = Boolean(activeLeave);
    const cutiReason = isCuti ? activeLeave?.note || 'Cuti' : null;

    // 2. Resolve room name if roomId provided
    let targetRoomName: string | null = null;
    if (query.roomId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.id, query.roomId),
      });
      targetRoomName = room?.name || 'Ruangan';
    }

    // 3. Construct the 4 shifts using authoritative context definitions
    const shifts: ScheduleShiftOccupancyEntity[] = [];

    for (const ctxDef of SCHEDULE_CONTEXT_DEFINITIONS) {
      shifts.push({
        contextId: ctxDef.contextId,
        contextLabel: ctxDef.contextLabel,
        sessionShift: ctxDef.sessionShift,
        timeRange: `${ctxDef.boundaryStartTime} - ${ctxDef.boundaryEndTime} WIB`,
        boundaryStartTime: ctxDef.boundaryStartTime,
        boundaryEndTime: ctxDef.boundaryEndTime,
      });
    }

    return {
      date: query.date,
      practitionerId,
      practitionerName,
      effectiveConsultationDurationMinutes: durationMinutes,
      roomId: query.roomId || null,
      roomName: targetRoomName,
      isCuti,
      cutiReason,
      summary: {
        totalShifts: shifts.length,
      },
      shifts,
    };
  }
}

import { ClinicConfigService } from '@common/clinic-config/clinic-config.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicRooms,
  doctorAssignments,
  queueTickets,
  sessionDefs,
  shiftExceptions,
} from '@database/schema';
import { SimulatorService } from '@modules/queue-engine/domain/services/simulator.service';
import {
  type ScheduleCapacityOverviewData,
  type ScheduleShiftCapacityEntity,
} from '@modules/schedules/domain/entities/schedule.entity';
import { parseClockTime } from '@modules/schedules/domain/schedule-projection';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { ScheduleCapacityQueryDto } from '@modules/schedules/presentation/dto/schedule-capacity-query.dto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleCapacityRepository {
  private readonly simulatorService = new SimulatorService();

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly policyReader: SchedulePolicyReader,
    private readonly clinicConfigService: ClinicConfigService,
  ) {}

  async getCapacityOverview(
    staffId: string,
    query: ScheduleCapacityQueryDto,
  ): Promise<ScheduleCapacityOverviewData> {
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

    // 0. Resolve load ratio thresholds dynamically from clinic_setting
    const loadThresholds =
      await this.clinicConfigService.getLoadRatioThresholds();

    // 1. Check if practitioner is on leave on target date via shiftExceptions
    const activeLeave = await this.db.query.shiftExceptions.findFirst({
      where: and(
        eq(shiftExceptions.doctorId, practitionerId),
        eq(shiftExceptions.serviceDate, query.date),
        eq(shiftExceptions.type, 'leave'),
      ),
    });

    const isOnLeave = Boolean(activeLeave);
    const leaveReason = isOnLeave ? activeLeave?.note || null : null;

    // 2. Resolve room name and count active clinic rooms
    const activeRooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
    });
    const totalClinicRooms = Math.max(1, activeRooms.length);

    let targetRoomName: string | null = null;
    if (query.roomId) {
      const room = activeRooms.find((r) => r.id === query.roomId);
      targetRoomName = room?.name || null;
    }

    // 3. Query session definitions, doctor assignments, and active tickets
    const [
      allSessionDefs,
      allDoctorAssignments,
      dateLeaveExceptions,
      activeQueueTickets,
    ] = await Promise.all([
      this.db.query.sessionDefs.findMany({
        where: eq(sessionDefs.isActive, true),
        orderBy: [asc(sessionDefs.sortOrder)],
      }),
      this.db.query.doctorAssignments.findMany({
        where: and(
          eq(doctorAssignments.isActive, true),
          or(
            eq(doctorAssignments.dow, new Date(query.date).getDay()),
            isNull(doctorAssignments.dow),
          ),
        ),
      }),
      this.db.query.shiftExceptions.findMany({
        where: and(
          eq(shiftExceptions.serviceDate, query.date),
          eq(shiftExceptions.type, 'leave'),
        ),
      }),
      this.db.query.queueTickets.findMany({
        where: and(
          eq(queueTickets.queueDate, query.date),
          inArray(queueTickets.status, ['waiting', 'called', 'in_service']),
        ),
      }),
    ]);

    const doctorsOnLeaveIds = new Set(
      dateLeaveExceptions.map((ex) => ex.doctorId),
    );

    // 4. Construct shifts with authoritative lane capacity & queue load
    const shifts: ScheduleShiftCapacityEntity[] = [];

    for (const sDef of allSessionDefs) {
      const assignedToSession = allDoctorAssignments.filter(
        (a) => a.sessionId === sDef.id,
      );
      const workingDoctors = assignedToSession.filter(
        (a) => !doctorsOnLeaveIds.has(a.doctorId),
      );

      let laneCapacity = 0;
      if (workingDoctors.length > 0) {
        laneCapacity = Math.min(workingDoctors.length, totalClinicRooms);
      } else if (!isOnLeave) {
        laneCapacity = 1;
      }

      const boundaryStartTime = (sDef.defaultStartsAt || '00:00').slice(0, 5);
      const boundaryEndTime = (sDef.defaultEndsAt || '24:00').slice(0, 5);
      const startMin = parseClockTime(boundaryStartTime);
      let endMin = parseClockTime(boundaryEndTime);
      if (endMin <= startMin) {
        endMin += 1440;
      }
      const shiftDurationMs = (endMin - startMin) * 60_000;
      const startMs =
        new Date(`${query.date}T00:00:00Z`).getTime() + startMin * 60_000;
      const effectiveSegments = [
        {
          start: new Date(startMs),
          end: new Date(startMs + shiftDurationMs),
        },
      ];

      const nominalCapacity = this.simulatorService.calculateNominalCapacity({
        lanes: Math.max(1, laneCapacity),
        effectiveSegments,
        estimatedDurationMinutes: durationMinutes,
      });

      const sessionTickets = activeQueueTickets.filter(
        (t) => t.sessionId === sDef.id,
      );
      const activeTicketsCount = sessionTickets.length;

      const loadStatus = this.simulatorService.resolveLoadStatus(
        activeTicketsCount,
        nominalCapacity,
        loadThresholds,
      );
      const loadRatio =
        nominalCapacity > 0
          ? Number((activeTicketsCount / nominalCapacity).toFixed(2))
          : 0;

      const label = sDef.label || sDef.code;

      shifts.push({
        contextId: sDef.id,
        contextLabel: label,
        sessionShift: sDef.code,
        timeRange: `${boundaryStartTime} - ${boundaryEndTime} WIB`,
        boundaryStartTime,
        boundaryEndTime,
        laneCapacity,
        activeTickets: activeTicketsCount,
        nominalCapacity,
        loadStatus,
        loadRatio,
      });
    }

    const totalActiveTickets = shifts.reduce(
      (sum, s) => sum + (s.activeTickets ?? 0),
      0,
    );
    const totalNominalCapacity = shifts.reduce(
      (sum, s) => sum + (s.nominalCapacity ?? 0),
      0,
    );
    const overallLoadRatio =
      totalNominalCapacity > 0
        ? Number((totalActiveTickets / totalNominalCapacity).toFixed(2))
        : 0;

    return {
      date: query.date,
      practitionerId,
      practitionerName,
      effectiveConsultationDurationMinutes: durationMinutes,
      roomId: query.roomId || null,
      roomName: targetRoomName,
      isOnLeave,
      leaveReason,
      summary: {
        totalShifts: shifts.length,
        totalActiveTickets,
        totalNominalCapacity,
        overallLoadRatio,
      },
      shifts,
    };
  }
}

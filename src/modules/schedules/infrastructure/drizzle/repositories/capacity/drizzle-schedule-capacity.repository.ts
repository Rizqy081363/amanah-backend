import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicRooms,
  doctorAssignments,
  queueTickets,
  sessionDefs,
  shiftExceptions,
} from '@database/schema';
import { ClinicConfigService } from '@common/clinic-config/clinic-config.service';
import { SimulatorService } from '@modules/queue-engine/domain/services/simulator.service';
import { SCHEDULE_CONTEXT_DEFINITIONS } from '@modules/schedules/domain/constants/schedule-context.constants';
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
    const loadThresholds = await this.clinicConfigService.getLoadRatioThresholds();

    // 1. Check if practitioner is on leave on target date via shiftExceptions
    const activeLeave = await this.db.query.shiftExceptions.findFirst({
      where: and(
        eq(shiftExceptions.doctorId, practitionerId),
        eq(shiftExceptions.serviceDate, query.date),
        eq(shiftExceptions.type, 'leave'),
      ),
    });

    const isOnLeave = Boolean(activeLeave);
    const leaveReason = isOnLeave ? activeLeave?.note || 'Doctor on leave' : null;

    // 2. Resolve room name and count active clinic rooms
    const activeRooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
    });
    const totalClinicRooms = Math.max(1, activeRooms.length);

    let targetRoomName: string | null = null;
    if (query.roomId) {
      const room = activeRooms.find((r) => r.id === query.roomId);
      targetRoomName = room?.name || 'Ruangan';
    }

    // 3. Query session definitions, doctor assignments, and active tickets
    const [allSessionDefs, allDoctorAssignments, dateLeaveExceptions, activeQueueTickets] =
      await Promise.all([
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

    const doctorsOnLeaveIds = new Set(dateLeaveExceptions.map((ex) => ex.doctorId));

    // 4. Construct shifts with authoritative lane capacity & queue load
    const shifts: ScheduleShiftCapacityEntity[] = [];

    for (const ctxDef of SCHEDULE_CONTEXT_DEFINITIONS) {
      const matchingSessionDef = allSessionDefs.find(
        (def) => def.code === ctxDef.sessionShift,
      );

      // Determine lanes: min(doctors on duty, clinic rooms)
      let laneCapacity = 0;
      if (matchingSessionDef) {
        const assignedToSession = allDoctorAssignments.filter(
          (a) => a.sessionId === matchingSessionDef.id,
        );
        const workingDoctors = assignedToSession.filter(
          (a) => !doctorsOnLeaveIds.has(a.doctorId),
        );

        if (workingDoctors.length > 0) {
          laneCapacity = Math.min(workingDoctors.length, totalClinicRooms);
        } else if (!isOnLeave) {
          laneCapacity = 1;
        }
      } else if (!isOnLeave) {
        laneCapacity = 1;
      }

      // Calculate shift time window
      const startMin = parseClockTime(ctxDef.boundaryStartTime);
      let endMin = parseClockTime(ctxDef.boundaryEndTime);
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

      // Calculate nominal capacity using Queue Engine Simulator
      const nominalCapacity = this.simulatorService.calculateNominalCapacity({
        lanes: Math.max(1, laneCapacity),
        effectiveSegments,
        estimatedDurationMinutes: durationMinutes,
      });

      // Count active tickets for this session
      const sessionTickets = activeQueueTickets.filter(
        (t) => matchingSessionDef && t.sessionId === matchingSessionDef.id,
      );
      const activeTicketsCount = sessionTickets.length;

      // Calculate load status and load ratio dynamically using thresholds
      const loadStatus = this.simulatorService.resolveLoadStatus(
        activeTicketsCount,
        nominalCapacity,
        loadThresholds,
      );
      const loadRatio =
        nominalCapacity > 0
          ? Number((activeTicketsCount / nominalCapacity).toFixed(2))
          : 0;

      shifts.push({
        contextId: ctxDef.contextId,
        contextLabel: ctxDef.contextLabel,
        sessionShift: ctxDef.sessionShift,
        timeRange: `${ctxDef.boundaryStartTime} - ${ctxDef.boundaryEndTime} WIB`,
        boundaryStartTime: ctxDef.boundaryStartTime,
        boundaryEndTime: ctxDef.boundaryEndTime,
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

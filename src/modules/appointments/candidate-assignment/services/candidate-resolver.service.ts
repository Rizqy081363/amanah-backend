import { ClinicTimeService, parseBusinessDate } from '@common/time/clinic-time.service';
import { Temporal } from '@js-temporal/polyfill';
import { Injectable, Optional } from '@nestjs/common';
import { filterEffectiveDoctorAssignments } from '@modules/schedules/domain/services/doctor-session-operational.resolver';
import {
  isTerminalAppointmentStatus,
  STAFF_TYPE,
} from '../../domain/constants/appointment-lifecycle.constants';
import {
  AppointmentNotFoundException,
  AppointmentTerminalStateException,
} from '../../domain/errors/appointment-assignment.errors';
import type { ICandidateResolverPort } from '../contracts/candidate-resolver.contract';
import {
  DOCTOR_AVAILABILITY,
  type DoctorCandidateGroup,
  type DoctorCandidateItem,
  type DoctorCandidatesResult,
} from '../domain/entities/candidate-doctor.entity';
import type { RoomCandidateItem } from '../domain/entities/candidate-room.entity';
import { SessionResolutionHelper } from '../domain/helpers/session-resolution.helper';
import { DrizzleCandidateAssignmentRepository } from '../infrastructure/drizzle-candidate-assignment.repository';

@Injectable()
export class CandidateResolverService implements ICandidateResolverPort {
  constructor(
    private readonly repository: DrizzleCandidateAssignmentRepository,
    private readonly clinicTimeService: ClinicTimeService,
  ) {}

  /**
   * Helper to resolve 0-indexed day-of-week (0=Sunday, 1=Monday, ..., 6=Saturday)
   * using Temporal plain date parsed via domain utility parseBusinessDate.
   */
  private resolveDow(dateStr: string): number {
    const businessDate = parseBusinessDate(dateStr);
    const plainDate = Temporal.PlainDate.from(businessDate);
    // Temporal dayOfWeek: 1 (Mon) .. 7 (Sun) -> convert to Postgres DOW: 0 (Sun) .. 6 (Sat)
    return plainDate.dayOfWeek % 7;
  }

  async resolveDoctorCandidates(
    appointmentId: string,
  ): Promise<DoctorCandidatesResult> {
    const context =
      await this.repository.findAppointmentWithContext(appointmentId);
    if (!context || !context.appointment) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    const { appointment: apt, queueTicket } = context;

    if (isTerminalAppointmentStatus(apt.status)) {
      throw new AppointmentTerminalStateException(apt.status);
    }

    const scheduledDate = apt.scheduledDate;
    const scheduledStartTime = apt.scheduledStartTime;
    const formattedTime = scheduledStartTime.slice(0, 5);

    // 1. Resolve operational session definition from DB
    const sessionDefs = await this.repository.findAllActiveSessionDefs();
    const resolvedSessionId = SessionResolutionHelper.resolveSessionId(
      scheduledStartTime,
      queueTicket?.sessionId,
      sessionDefs,
    );

    // 2. Day-of-week for roster matching (0 = Sunday, 1 = Monday, ...) using domain utility
    const dow = this.resolveDow(scheduledDate);

    // 3. Parallel queries for roster assignments, leaves, queue loads, practitioners, and dynamic medical specialties
    const [
      rawRosterAssignments,
      activeLeaves,
      queueCounts,
      allPractitioners,
      allSpecialties,
    ] = await Promise.all([
      resolvedSessionId
        ? this.repository.findRosteredDoctors(resolvedSessionId, dow)
        : Promise.resolve([]),
      this.repository.findActiveDoctorLeaves(
        scheduledDate,
        resolvedSessionId,
      ),
      this.repository.countActiveQueuePerDoctor(
        scheduledDate,
        resolvedSessionId,
      ),
      this.repository.findAllActivePractitioners(),
      this.repository.findAllActiveSpecialties(),
    ]);

    // Apply domain override hierarchy: explicit dow shadows generic null dow
    const effectiveRosterAssignments = filterEffectiveDoctorAssignments(
      rawRosterAssignments,
      dow,
    );

    const onRosterDoctorIds = new Set(
      effectiveRosterAssignments.map((ra: { doctorId: string }) => ra.doctorId),
    );
    const onLeaveDoctorIds = new Set(activeLeaves.map((l) => l.doctorId));

    // Dynamic specialty map from database
    const specialtyMap = new Map(allSpecialties.map((s) => [s.id, s]));
    const groupMap = new Map<string, DoctorCandidateGroup>();

    // Seed groups from dynamic medical specialties in the database
    for (const spec of allSpecialties) {
      groupMap.set(spec.id, {
        id: spec.id,
        name: spec.name,
        code: spec.code,
        doctors: [],
      });
    }

    for (const p of allPractitioners) {
      // Don't show doctor if currently assigned as the patient's existing doctor
      if (p.id === apt.practitionerId) continue;

      // Check leave
      const isOnLeave = onLeaveDoctorIds.has(p.id);
      if (isOnLeave) continue;

      const isRostered = onRosterDoctorIds.has(p.id);
      const queueCount = queueCounts.get(p.id) || 0;

      const matchedSpecialty =
        (p.specialtyId ? specialtyMap.get(p.specialtyId) : null) ||
        p.medicalSpecialty ||
        null;

      const groupId =
        matchedSpecialty?.id ||
        p.staffProfile?.primaryUnitId ||
        p.specialtyId ||
        p.id;

      const groupName =
        matchedSpecialty?.name ||
        p.staffProfile?.clinicUnit?.name ||
        p.staffProfile?.positionTitle ||
        p.displayName;

      const groupCode =
        matchedSpecialty?.code ||
        p.staffProfile?.clinicUnit?.code ||
        null;

      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          id: groupId,
          name: groupName,
          code: groupCode,
          doctors: [],
        });
      }

      const currentGroup = groupMap.get(groupId)!;

      currentGroup.doctors.push({
        id: p.id,
        name: p.displayName || p.staffProfile?.fullName || '',
        specialty: currentGroup.name,
        staffType: p.staffProfile?.staffType || STAFF_TYPE.DOCTOR,
        availability: isRostered
          ? DOCTOR_AVAILABILITY.AVAILABLE
          : DOCTOR_AVAILABILITY.SCHEDULE_REQUIRED,
        existingSessionId: resolvedSessionId,
        currentQueueCount: queueCount,
      });
    }

    // Filter to groups that have candidates
    const activeGroups = Array.from(groupMap.values()).filter(
      (g) => g.doctors.length > 0,
    );

    // Sort: AVAILABLE doctors first, then by current queue load ascending
    for (const group of activeGroups) {
      group.doctors.sort((a, b) => {
        if (a.availability !== b.availability) {
          return a.availability === DOCTOR_AVAILABILITY.AVAILABLE ? -1 : 1;
        }
        return (a.currentQueueCount ?? 0) - (b.currentQueueCount ?? 0);
      });
    }

    const targetSpecialtyId =
      apt.clinicService?.specialtyId ||
      apt.clinicService?.medicalSpecialty?.id ||
      null;
    const targetSpecialtyName =
      apt.clinicService?.medicalSpecialty?.name || null;

    const sortedGroups = activeGroups.sort((a, b) => {
      if (targetSpecialtyId) {
        if (a.id === targetSpecialtyId && b.id !== targetSpecialtyId) return -1;
        if (b.id === targetSpecialtyId && a.id !== targetSpecialtyId) return 1;
      }
      if (targetSpecialtyName) {
        if (a.name === targetSpecialtyName && b.name !== targetSpecialtyName)
          return -1;
        if (b.name === targetSpecialtyName && a.name !== targetSpecialtyName)
          return 1;
      }
      return a.name.localeCompare(b.name);
    });

    const tzAbbr = this.clinicTimeService.getTimezoneAbbreviation();

    return {
      appointmentId: apt.id,
      currentDoctorId: apt.practitionerId,
      scheduledDate,
      scheduledTime: `${formattedTime} ${tzAbbr}`,
      groups: sortedGroups,
    };
  }

  async resolveRoomCandidates(
    appointmentId: string,
  ): Promise<RoomCandidateItem[]> {
    const context =
      await this.repository.findAppointmentWithContext(appointmentId);
    if (!context || !context.appointment) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    const { appointment: apt, queueTicket } = context;

    if (isTerminalAppointmentStatus(apt.status)) {
      throw new AppointmentTerminalStateException(apt.status);
    }

    const scheduledDate = apt.scheduledDate;

    // 1. Resolve operational session definition
    const sessionDefs = await this.repository.findAllActiveSessionDefs();
    const resolvedSessionId = SessionResolutionHelper.resolveSessionId(
      apt.scheduledStartTime,
      queueTicket?.sessionId,
      sessionDefs,
    );
    const dow = this.resolveDow(scheduledDate);

    // 2. Fetch active clinic rooms and runtime room occupants
    const [allRooms, runtimeOccupants, preferredRoomId] = await Promise.all([
      this.repository.findAllActiveClinicRooms(),
      this.repository.findActiveRuntimeRoomOccupants(scheduledDate),
      apt.practitionerId
        ? this.repository.findDoctorPreferredRoomId(
            apt.practitionerId,
            resolvedSessionId,
            dow,
          )
        : Promise.resolve(null),
    ]);

    return allRooms.map((room) => {
      const occupant = runtimeOccupants.get(room.id) || null;
      const isOccupied = Boolean(occupant);

      return {
        id: room.id,
        name: room.name,
        code: room.code,
        location: room.location,
        isAvailable: !isOccupied,
        isPreferred: preferredRoomId ? room.id === preferredRoomId : false,
        occupantDetails: occupant,
      };
    });
  }
}

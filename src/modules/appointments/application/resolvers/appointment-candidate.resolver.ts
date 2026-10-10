import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  doctorAssignments,
  practitioners,
  shiftExceptions,
} from '@database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, not } from 'drizzle-orm';
import { ACTIVE_APPOINTMENT_STATUSES } from '../../../schedules/domain/constants/schedule.constants';
import {
  AppointmentNotFoundException,
  AppointmentTerminalStateException,
} from '../../domain/errors/appointment-assignment.errors';
import { AppointmentTemporalStatusHelper } from '../../domain/helpers/appointment-temporal-status.helper';

export interface DoctorCandidateItem {
  id: string;
  name: string;
  specialty: string;
  staffType: string;
  availability: 'AVAILABLE' | 'SCHEDULE_REQUIRED';
  existingSessionId: string | null;
}

export interface DoctorCandidateGroup {
  id: string;
  name: string;
  doctors: DoctorCandidateItem[];
}

export interface DoctorCandidatesResult {
  appointmentId: string;
  currentDoctorId: string | null;
  scheduledDate: string;
  scheduledTime: string;
  groups: DoctorCandidateGroup[];
}

export interface RoomCandidateItem {
  id: string;
  name: string;
  code: string;
  location: string | null;
  isAvailable: boolean;
  occupantDetails?: {
    practitionerId?: string;
    doctorName?: string;
    bookingCode?: string;
    startTime?: string;
  } | null;
}

@Injectable()
export class AppointmentCandidateResolver {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async resolveDoctorCandidates(
    appointmentId: string,
  ): Promise<DoctorCandidatesResult> {
    const apt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        practitioner: true,
        clinicService: {
          with: {
            medicalSpecialty: true,
          },
        },
      },
    });

    if (!apt) {
      throw new AppointmentNotFoundException(appointmentId);
    }
    if (apt.status === 'cancelled' || apt.status === 'completed') {
      throw new AppointmentTerminalStateException(apt.status);
    }

    const scheduledDate = apt.scheduledDate;
    const startTime = apt.scheduledStartTime;
    const formattedTime = startTime.slice(0, 5);

    const allPractitioners = await this.db.query.practitioners.findMany({
      where: eq(practitioners.isAcceptingAppointments, true),
      with: {
        staffProfile: true,
        medicalSpecialty: true,
      },
    });

    const conflictingAppts = await this.db.query.appointments.findMany({
      where: and(
        eq(appointments.scheduledDate, scheduledDate),
        eq(appointments.scheduledStartTime, startTime),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        not(eq(appointments.id, appointmentId)),
      ),
    });
    const occupiedDoctorIds = new Set(
      conflictingAppts
        .filter(
          (a) =>
            !['completed', 'cancelled', 'no_show'].includes(a.status) &&
            !AppointmentTemporalStatusHelper.isElapsed({
              scheduledDate: a.scheduledDate,
              scheduledStartTime: a.scheduledStartTime,
              scheduledEndTime: a.scheduledEndTime,
            }),
        )
        .map((a) => a.practitionerId)
        .filter(Boolean),
    );

    // Lapis 3: Shift exceptions (cuti dokter)
    const leaves = await this.db.query.shiftExceptions.findMany({
      where: and(
        eq(shiftExceptions.serviceDate, scheduledDate),
        eq(shiftExceptions.type, 'leave'),
      ),
    });
    const onLeaveDoctorIds = new Set(leaves.map((l) => l.doctorId));

    // Lapis 2: Penugasan roster dokter
    const dow = new Date(`${scheduledDate}T00:00:00.000Z`).getUTCDay();
    const rosterAssignments = await this.db.query.doctorAssignments.findMany({
      where: and(
        eq(doctorAssignments.dow, dow),
        eq(doctorAssignments.isActive, true),
      ),
    });
    const onRosterDoctorIds = new Set(
      rosterAssignments.map((ra) => ra.doctorId),
    );

    const groupMap = new Map<string, DoctorCandidateGroup>();

    for (const p of allPractitioners) {
      if (p.id === apt.practitionerId) continue;
      if (occupiedDoctorIds.has(p.id)) continue;
      if (onLeaveDoctorIds.has(p.id)) continue;

      const isRostered = onRosterDoctorIds.has(p.id);

      const groupKey = p.medicalSpecialty?.name || 'Dokter Umum';
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          id: p.specialtyId || groupKey.toLowerCase().replace(/\s+/g, '_'),
          name: groupKey,
          doctors: [],
        });
      }

      groupMap.get(groupKey)!.doctors.push({
        id: p.id,
        name: p.displayName || p.staffProfile?.fullName || 'Dokter',
        specialty: groupKey,
        staffType: p.staffProfile?.staffType || 'doctor',
        availability: isRostered ? 'AVAILABLE' : 'SCHEDULE_REQUIRED',
        existingSessionId: null,
      });
    }

    const targetSpecialtyName =
      apt.clinicService?.medicalSpecialty?.name || null;

    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
      if (targetSpecialtyName) {
        if (a.name === targetSpecialtyName && b.name !== targetSpecialtyName)
          return -1;
        if (b.name === targetSpecialtyName && a.name !== targetSpecialtyName)
          return 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      appointmentId: apt.id,
      currentDoctorId: apt.practitionerId,
      scheduledDate,
      scheduledTime: `${formattedTime} WIB`,
      groups: sortedGroups,
    };
  }

  async resolveRoomCandidates(
    appointmentId: string,
  ): Promise<RoomCandidateItem[]> {
    const apt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
    });

    if (!apt) {
      throw new AppointmentNotFoundException(appointmentId);
    }
    if (apt.status === 'cancelled' || apt.status === 'completed') {
      throw new AppointmentTerminalStateException(apt.status);
    }

    const scheduledDate = apt.scheduledDate;
    const startTime = apt.scheduledStartTime;
    const endTime = apt.scheduledEndTime;

    const allRooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
    });

    const isTargetTimeElapsed = AppointmentTemporalStatusHelper.isElapsed({
      scheduledDate,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
    });

    if (isTargetTimeElapsed) {
      return allRooms.map((room) => ({
        id: room.id,
        name: room.name,
        code: room.code,
        location: room.location,
        isAvailable: true,
        occupantDetails: null,
      }));
    }

    const conflictingAppts = await this.db.query.appointments.findMany({
      where: and(
        eq(appointments.scheduledDate, scheduledDate),
        eq(appointments.scheduledStartTime, startTime),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        not(eq(appointments.id, appointmentId)),
      ),
      with: {
        practitioner: { with: { staffProfile: true } },
      },
    });

    const roomOccupantMap = new Map<
      string,
      {
        practitionerId?: string;
        doctorName?: string;
        bookingCode?: string;
        startTime?: string;
      }
    >();

    for (const c of conflictingAppts) {
      if (!c.roomId) continue;

      const isApptFinished =
        ['completed', 'cancelled', 'no_show'].includes(c.status) ||
        AppointmentTemporalStatusHelper.isElapsed({
          scheduledDate: c.scheduledDate,
          scheduledStartTime: c.scheduledStartTime,
          scheduledEndTime: c.scheduledEndTime,
        });

      if (isApptFinished) continue;

      roomOccupantMap.set(c.roomId, {
        practitionerId: c.practitionerId || undefined,
        doctorName:
          c.practitioner?.displayName || c.practitioner?.staffProfile?.fullName,
        bookingCode: c.bookingCode,
        startTime: c.scheduledStartTime
          ? c.scheduledStartTime.slice(0, 5)
          : undefined,
      });
    }

    return allRooms.map((room) => {
      const isOccupied = roomOccupantMap.has(room.id);
      return {
        id: room.id,
        name: room.name,
        code: room.code,
        location: room.location,
        isAvailable: !isOccupied,
        occupantDetails: isOccupied ? roomOccupantMap.get(room.id) : null,
      };
    });
  }
}

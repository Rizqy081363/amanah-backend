import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  practitionerScheduleSessions,
  practitioners,
} from '@database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, not } from 'drizzle-orm';
import { ACTIVE_APPOINTMENT_STATUSES } from '../../../schedules/domain/constants/schedule.constants';
import {
  AppointmentNotFoundException,
  AppointmentTerminalStateException,
} from '../../domain/errors/appointment-assignment.errors';

export interface DoctorCandidateItem {
  id: string;
  name: string;
  specialty: string;
  staffType: string;
  availability: 'AVAILABLE' | 'SCHEDULE_REQUIRED';
  existingSessionId: string | null;
  defaultRoomName: string | null;
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
    doctorName?: string;
    bookingCode?: string;
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
      with: { practitioner: true },
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

    // 1. Fetch all active practitioners
    const allPractitioners = await this.db.query.practitioners.findMany({
      where: eq(practitioners.isAcceptingAppointments, true),
      with: {
        staffProfile: true,
        medicalSpecialty: true,
        clinicRoom: true,
      },
    });

    // 2. Fetch doctors with conflicting appointments at the same date & time slot
    const conflictingAppts = await this.db.query.appointments.findMany({
      where: and(
        eq(appointments.scheduledDate, scheduledDate),
        eq(appointments.scheduledStartTime, startTime),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        not(eq(appointments.id, appointmentId)),
      ),
    });
    const occupiedDoctorIds = new Set(
      conflictingAppts.map((a) => a.practitionerId).filter(Boolean),
    );

    // 3. Fetch existing open schedule sessions for this date that cover the start time
    const existingSessions =
      await this.db.query.practitionerScheduleSessions.findMany({
        where: and(
          eq(practitionerScheduleSessions.scheduleDate, scheduledDate),
          eq(practitionerScheduleSessions.status, 'open'),
        ),
      });

    const groupMap = new Map<string, DoctorCandidateGroup>();

    for (const p of allPractitioners) {
      // Exclude current doctor
      if (p.id === apt.practitionerId) continue;
      // Exclude doctor already occupied with another patient at this exact slot
      if (occupiedDoctorIds.has(p.id)) continue;

      const matchingSession = existingSessions.find(
        (s) =>
          s.practitionerId === p.id &&
          s.startTime <= startTime &&
          s.endTime > startTime,
      );

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
        availability: matchingSession ? 'AVAILABLE' : 'SCHEDULE_REQUIRED',
        existingSessionId: matchingSession?.id || null,
        defaultRoomName: p.clinicRoom?.name || null,
      });
    }

    return {
      appointmentId: apt.id,
      currentDoctorId: apt.practitionerId,
      scheduledDate,
      scheduledTime: `${formattedTime} WIB`,
      groups: Array.from(groupMap.values()),
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

    const allRooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
    });

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
      { doctorName?: string; bookingCode?: string }
    >();
    for (const c of conflictingAppts) {
      if (c.roomId) {
        roomOccupantMap.set(c.roomId, {
          doctorName:
            c.practitioner?.displayName ||
            c.practitioner?.staffProfile?.fullName,
          bookingCode: c.bookingCode,
        });
      }
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

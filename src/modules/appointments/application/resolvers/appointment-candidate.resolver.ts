import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  practitionerScheduleSessions,
  practitioners,
} from '@database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, not, sql } from 'drizzle-orm';
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
          s.endTime > startTime &&
          !AppointmentTemporalStatusHelper.isElapsed({
            scheduledDate: s.scheduleDate,
            scheduledStartTime: s.startTime,
            scheduledEndTime: s.endTime,
          }),
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
    const endTime = apt.scheduledEndTime;

    const allRooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
    });

    // If the target appointment's slot itself is already elapsed (past date or past clock time),
    // no active room collision exists.
    const isTargetSlotElapsed = AppointmentTemporalStatusHelper.isElapsed({
      scheduledDate,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
    });

    if (isTargetSlotElapsed) {
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

    // Check doctor schedule sessions occupying rooms at this date and time
    if (this.db.query.practitionerScheduleSessions) {
      const conflictingSessions =
        await this.db.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(practitionerScheduleSessions.scheduleDate, scheduledDate),
            eq(practitionerScheduleSessions.status, 'open'),
            sql`${practitionerScheduleSessions.startTime} <= ${startTime}::time AND ${practitionerScheduleSessions.endTime} > ${startTime}::time`,
            apt.practitionerId
              ? not(eq(practitionerScheduleSessions.practitionerId, apt.practitionerId))
              : sql`true`,
          ),
          with: {
            practitioner: { with: { staffProfile: true } },
          },
        });
      for (const s of conflictingSessions) {
        if (!s.roomId) continue;
        if (apt.practitionerId && s.practitionerId === apt.practitionerId) continue;

        // Exclude sessions that have already finished (isElapsed / past / completed)
        const isSessionFinished =
          s.status !== 'open' ||
          AppointmentTemporalStatusHelper.isElapsed({
            scheduledDate: s.scheduleDate,
            scheduledStartTime: s.startTime,
            scheduledEndTime: s.endTime,
          });

        if (isSessionFinished) continue;

        roomOccupantMap.set(s.roomId, {
          practitionerId: s.practitionerId || undefined,
          doctorName:
            s.practitioner?.displayName ||
            s.practitioner?.staffProfile?.fullName,
          startTime: s.startTime ? s.startTime.slice(0, 5) : undefined,
        });
      }
    }

    for (const c of conflictingAppts) {
      if (!c.roomId) continue;

      // Exclude appointments that have already completed/cancelled/no_show or elapsed (Sudah Selesai)
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
          c.practitioner?.displayName ||
          c.practitioner?.staffProfile?.fullName,
        bookingCode: c.bookingCode,
        startTime: c.scheduledStartTime ? c.scheduledStartTime.slice(0, 5) : undefined,
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

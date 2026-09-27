import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicRooms,
  clinicUnits,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
} from '@database/schema';
import { CLINIC_TIMEZONE } from '@modules/schedules/domain/constants/schedule.constants';
import {
  CANONICAL_STAFF_SHIFTS,
  resolveCanonicalShift,
  SHIFT_DISPLAY_LABELS,
  SHIFT_TIMING_CONFIGS,
} from '@modules/schedules/domain/constants/schedule-shift.constants';
import type {
  ScheduleFormBootstrapData,
  ScheduleFormBootstrapPoliklinik,
  ScheduleFormBootstrapRoom,
  ScheduleFormBootstrapShift,
  ScheduleSlotAvailabilityData,
  ScheduleSlotAvailabilityItem,
} from '@modules/schedules/domain/entities/schedule-bootstrap.entity';
import {
  formatClockTime,
  parseClockTime,
} from '@modules/schedules/domain/schedule-projection';
import { SchedulePersistenceStatus } from '@modules/schedules/domain/schedule-status';
import { getClinicNow } from '@modules/schedules/domain/services/schedule-date.formatter';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { ScheduleFormBootstrapQueryDto } from '@modules/schedules/presentation/dto/schedule-form-bootstrap-query.dto';
import type { ScheduleSlotAvailabilityQueryDto } from '@modules/schedules/presentation/dto/schedule-slot-availability-query.dto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleBootstrapRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly policyReader: SchedulePolicyReader,
  ) {}

  async getFormBootstrap(
    staffId: string,
    query: ScheduleFormBootstrapQueryDto,
  ): Promise<ScheduleFormBootstrapData> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const doctorName =
      practitioner.staffProfile?.fullName ||
      practitioner.displayName ||
      'Dokter';
    const policy = await this.policyReader.getPolicy(practitioner);
    const consultationDurationMinutes = policy.durationMinutes;

    // 1. Resolve default room & poliklinik
    let defaultRoomId: string | null = practitioner.defaultRoomId || null;
    let defaultRoomName: string | null = null;
    let defaultPoliklinikId: string | null = null;
    let defaultPoliklinikName: string | null = null;

    const [allRooms, allUnits, daySessions] = await Promise.all([
      this.db.query.clinicRooms.findMany({
        where: eq(clinicRooms.isActive, true),
        orderBy: [asc(clinicRooms.floor), asc(clinicRooms.name)],
        with: {
          clinicUnit: true,
        },
      }),
      this.db.query.clinicUnits.findMany({
        where: eq(clinicUnits.isActive, true),
        orderBy: [asc(clinicUnits.name)],
      }),
      this.db.query.practitionerScheduleSessions.findMany({
        where: and(
          eq(practitionerScheduleSessions.scheduleDate, query.date),
          eq(
            practitionerScheduleSessions.status,
            SchedulePersistenceStatus.OPEN,
          ),
        ),
        with: {
          practitioner: {
            with: {
              staffProfile: true,
            },
          },
          clinicRoom: true,
        },
      }),
    ]);

    const resolvedDefaultRoom = defaultRoomId
      ? allRooms.find((r) => r.id === defaultRoomId)
      : allRooms[0];

    if (resolvedDefaultRoom) {
      defaultRoomId = resolvedDefaultRoom.id;
      defaultRoomName = resolvedDefaultRoom.name;
      if (resolvedDefaultRoom.clinicUnit) {
        defaultPoliklinikId = resolvedDefaultRoom.clinicUnit.id;
        defaultPoliklinikName = resolvedDefaultRoom.clinicUnit.name;
      }
    }

    if (!defaultPoliklinikId && allUnits.length > 0) {
      defaultPoliklinikId = allUnits[0].id;
      defaultPoliklinikName = allUnits[0].name;
    }

    // 2. Build rooms reference list with live occupancy for the selected date
    const rooms: ScheduleFormBootstrapRoom[] = allRooms.map((r) => {
      const activeSession = daySessions.find((s) => s.roomId === r.id);
      if (activeSession) {
        const occName =
          activeSession.practitioner?.staffProfile?.fullName ||
          activeSession.practitioner?.displayName ||
          'Dokter';
        return {
          id: r.id,
          name: r.name,
          code: r.code,
          isOccupied: true,
          occupiedBy: occName,
        };
      }
      return {
        id: r.id,
        name: r.name,
        code: r.code,
        isOccupied: false,
        occupiedBy: null,
      };
    });

    // 3. Build polikliniks list
    const polikliniks: ScheduleFormBootstrapPoliklinik[] = allUnits.map(
      (u) => ({
        id: u.id,
        name: u.name,
        code: u.code,
      }),
    );

    // 4. Build 4 shifts with temporal status (isPast) & existing doctor session
    const { date: todayDate, currentMinutes } = getClinicNow();
    const isPastDate = query.date < todayDate;
    const isFutureDate = query.date > todayDate;

    const doctorSessions = daySessions.filter(
      (s) => s.practitionerId === practitioner.id,
    );

    const shifts: ScheduleFormBootstrapShift[] = CANONICAL_STAFF_SHIFTS.map(
      (shiftCode) => {
        const config = SHIFT_TIMING_CONFIGS[shiftCode];
        const endMinutes = parseClockTime(config.defaultEndTime);

        let isPast = false;
        if (isPastDate) {
          isPast = true;
        } else if (isFutureDate) {
          isPast = false;
        } else {
          // Today: compare clock minutes
          isPast = endMinutes <= currentMinutes;
        }

        // Check if doctor has a schedule in this shift on this date
        const existingSession = doctorSessions.find((s) => {
          if (query.scheduleId && s.id === query.scheduleId) {
            return true;
          }
          return (
            s.sessionShift === shiftCode ||
            s.sessionLabel?.toLowerCase().includes(config.label.toLowerCase())
          );
        });

        let existingSchedule: any = null;
        if (existingSession) {
          existingSchedule = {
            id: existingSession.id,
            startTime: existingSession.startTime.slice(0, 5),
            endTime: existingSession.endTime.slice(0, 5),
            status:
              existingSession.status === SchedulePersistenceStatus.CLOSED
                ? 'CLOSED'
                : 'OPEN',
            roomId: existingSession.roomId,
            roomName: existingSession.clinicRoom?.name || null,
            capacity: existingSession.capacity,
            availableSlots: existingSession.availableSlots,
            notes: existingSession.notes || null,
          };
        }

        const idMapping: Record<string, string> = {
          early_morning: 'dini_hari',
          morning: 'pagi',
          afternoon: 'siang',
          night: 'malam',
        };

        return {
          id: idMapping[shiftCode] || shiftCode,
          code: shiftCode,
          name: `Sesi ${config.label}`,
          startTime: config.defaultStartTime,
          endTime: config.defaultEndTime,
          isPast,
          existingSchedule,
        };
      },
    );

    return {
      doctor: {
        id: practitioner.id,
        name: doctorName,
        defaultRoomId,
        defaultRoomName,
        defaultPoliklinikId,
        defaultPoliklinikName,
        consultationDurationMinutes,
      },
      rooms,
      polikliniks,
      shifts,
    };
  }

  async getSlotAvailability(
    staffId: string,
    query: ScheduleSlotAvailabilityQueryDto,
  ): Promise<ScheduleSlotAvailabilityData> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const doctorName =
      practitioner.staffProfile?.fullName ||
      practitioner.displayName ||
      'Dokter';
    const policy = await this.policyReader.getPolicy(practitioner);
    const intervalMinutes = policy.durationMinutes;

    // 1. Resolve canonical shift & boundaries
    const resolvedShift = resolveCanonicalShift({
      sessionShift: query.shift,
      session: query.shift,
    });
    const timingConfig = SHIFT_TIMING_CONFIGS[resolvedShift.shift];
    const boundary = {
      startTime: timingConfig.defaultStartTime,
      endTime: timingConfig.defaultEndTime,
    };
    const shiftLabel = `Sesi ${timingConfig.label}`;

    // 2. Validate room
    const targetRoom = await this.db.query.clinicRooms.findFirst({
      where: eq(clinicRooms.id, query.roomId),
    });
    if (!targetRoom) {
      throw new NotFoundException(
        `Ruangan dengan ID ${query.roomId} tidak ditemukan`,
      );
    }
    const roomName = targetRoom.name;

    // 3. Check doctor leave on target date
    const [daySetting, activeLeave] = await Promise.all([
      this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitioner.id),
          eq(practitionerScheduleDaySettings.scheduleDate, query.date),
        ),
      }),
      this.db.query.practitionerLeavePeriods.findFirst({
        where: and(
          eq(practitionerLeavePeriods.practitionerId, practitioner.id),
          lte(practitionerLeavePeriods.startDate, query.date),
          gte(practitionerLeavePeriods.endDate, query.date),
        ),
      }),
    ]);

    const isLeave = Boolean(daySetting?.isLeave || activeLeave);
    const leaveReason =
      daySetting?.leaveReason || activeLeave?.reason || 'Cuti';

    // 4. Fetch all active sessions on target date
    const allDaySessions =
      await this.db.query.practitionerScheduleSessions.findMany({
        where: and(
          eq(practitionerScheduleSessions.scheduleDate, query.date),
          eq(
            practitionerScheduleSessions.status,
            SchedulePersistenceStatus.OPEN,
          ),
        ),
        with: {
          practitioner: {
            with: {
              staffProfile: true,
            },
          },
          clinicRoom: true,
        },
      });

    // Exclude specified schedule if editing
    const activeSessions = query.excludeScheduleId
      ? allDaySessions.filter((s) => s.id !== query.excludeScheduleId)
      : allDaySessions;

    // 5. Generate theoretical slots within boundary
    const boundaryStartMin = parseClockTime(boundary.startTime);
    const boundaryEndMin = parseClockTime(boundary.endTime);
    const totalSlots = Math.floor(
      (boundaryEndMin - boundaryStartMin) / intervalMinutes,
    );

    const { date: todayDate, currentMinutes } = getClinicNow();
    const isPastDate = query.date < todayDate;

    const slots: ScheduleSlotAvailabilityItem[] = [];

    for (let i = 0; i < totalSlots; i++) {
      const slotStartMin = boundaryStartMin + i * intervalMinutes;
      const slotEndMin = slotStartMin + intervalMinutes;
      const slotStartTime = formatClockTime(slotStartMin);
      const slotEndTime = formatClockTime(slotEndMin);

      // Priority 1: Temporal Past
      if (
        isPastDate ||
        (query.date === todayDate && slotEndMin <= currentMinutes)
      ) {
        slots.push({
          slotIndex: i,
          time: slotStartTime,
          endTime: slotEndTime,
          isAvailable: false,
          status: 'PAST',
          displayLabel: 'Sudah Selesai',
          conflict: {
            type: 'TEMPORAL_PAST',
            occupantName: null,
            reason: 'Slot waktu ini telah melewati jam operasional saat ini.',
          },
        });
        continue;
      }

      // Priority 2: Doctor on Leave
      if (isLeave) {
        slots.push({
          slotIndex: i,
          time: slotStartTime,
          endTime: slotEndTime,
          isAvailable: false,
          status: 'CLOSED_LEAVE',
          displayLabel: 'Cuti',
          conflict: {
            type: 'LEAVE',
            occupantName: null,
            reason: leaveReason || 'Dokter tercatat sedang cuti.',
          },
        });
        continue;
      }

      // Priority 3: Doctor's Own Overlapping Schedule in Another Room
      const selfSession = activeSessions.find((s) => {
        if (s.practitionerId !== practitioner.id) return false;
        const sStart = parseClockTime(s.startTime.slice(0, 5));
        const sEnd = parseClockTime(s.endTime.slice(0, 5));
        return sStart < slotEndMin && sEnd > slotStartMin;
      });

      if (selfSession) {
        const selfRoomName = selfSession.clinicRoom?.name || 'ruangan lain';
        slots.push({
          slotIndex: i,
          time: slotStartTime,
          endTime: slotEndTime,
          isAvailable: false,
          status: 'OCCUPIED_BY_SELF',
          displayLabel: 'Jadwal Anda',
          conflict: {
            type: 'PRACTITIONER_OVERLAP',
            occupantName: doctorName,
            reason: `Anda telah memiliki jadwal pada jam ${selfSession.startTime.slice(0, 5)} - ${selfSession.endTime.slice(0, 5)} WIB di ${selfRoomName}.`,
          },
        });
        continue;
      }

      // Priority 4: Room Occupied by Another Doctor
      const otherSession = activeSessions.find((s) => {
        if (s.roomId !== query.roomId) return false;
        if (s.practitionerId === practitioner.id) return false;
        const sStart = parseClockTime(s.startTime.slice(0, 5));
        const sEnd = parseClockTime(s.endTime.slice(0, 5));
        return sStart < slotEndMin && sEnd > slotStartMin;
      });

      if (otherSession) {
        const otherDoctorName =
          otherSession.practitioner?.staffProfile?.fullName ||
          otherSession.practitioner?.displayName ||
          'Dokter lain';
        slots.push({
          slotIndex: i,
          time: slotStartTime,
          endTime: slotEndTime,
          isAvailable: false,
          status: 'OCCUPIED_BY_OTHER',
          displayLabel: otherDoctorName,
          conflict: {
            type: 'ROOM_OCCUPIED',
            occupantName: otherDoctorName,
            reason: `${roomName} sudah dialokasikan untuk ${otherDoctorName} pada jam ${otherSession.startTime.slice(0, 5)} - ${otherSession.endTime.slice(0, 5)} WIB.`,
          },
        });
        continue;
      }

      // Priority 5: Available
      slots.push({
        slotIndex: i,
        time: slotStartTime,
        endTime: slotEndTime,
        isAvailable: true,
        status: 'AVAILABLE',
        displayLabel: 'Tersedia',
        conflict: null,
      });
    }

    const availableSlots = slots.filter((s) => s.isAvailable).length;
    const occupiedSlots = slots.filter((s) => !s.isAvailable).length;

    return {
      date: query.date,
      shift: timingConfig.shift,
      shiftLabel,
      roomId: query.roomId,
      roomName,
      boundary,
      intervalMinutes,
      summary: {
        totalSlots: slots.length,
        availableSlots,
        occupiedSlots,
      },
      slots,
    };
  }
}

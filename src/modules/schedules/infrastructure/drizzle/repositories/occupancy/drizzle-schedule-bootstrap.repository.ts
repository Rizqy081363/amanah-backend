import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
} from '@database/schema';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  SCHEDULE_SLOT_STATUS,
  SCHEDULE_SLOT_CONFLICT_TYPE,
} from '@modules/schedules/domain/constants/schedule.constants';
import {
  resolveCanonicalShift,
  SHIFT_TIMING_CONFIGS,
} from '@modules/schedules/domain/constants/schedule-shift.constants';
import type {
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
import type { ScheduleSlotAvailabilityQueryDto } from '@modules/schedules/presentation/dto/schedule-slot-availability-query.dto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleBootstrapRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly policyReader: SchedulePolicyReader,
  ) {}

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

    // 3. Check doctor leave, sessions, and active appointments on target date
    const [daySetting, activeLeave, allDaySessions, activeAppointments] =
      await Promise.all([
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
        this.db.query.appointments.findMany({
          where: and(
            eq(appointments.scheduledDate, query.date),
            inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
          ),
          with: {
            patientProfile: true,
          },
        }),
      ]);

    const isLeave = Boolean(daySetting?.isLeave || activeLeave);
    const leaveReason =
      daySetting?.leaveReason || activeLeave?.reason || 'Cuti';

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
          status: SCHEDULE_SLOT_STATUS.PAST,
          displayLabel: 'Sudah Selesai',
          conflict: {
            type: SCHEDULE_SLOT_CONFLICT_TYPE.TEMPORAL_PAST,
            occupantName: null,
            reason: 'Slot waktu ini telah melewati jam operasional saat ini.',
          },
        });
        continue;
      }

      if (isLeave) {
        slots.push({
          slotIndex: i,
          time: slotStartTime,
          endTime: slotEndTime,
          isAvailable: false,
          status: SCHEDULE_SLOT_STATUS.CLOSED_LEAVE,
          displayLabel: 'Cuti',
          conflict: {
            type: SCHEDULE_SLOT_CONFLICT_TYPE.LEAVE,
            occupantName: null,
            reason: leaveReason || 'Dokter tercatat sedang cuti.',
          },
        });
        continue;
      }

      const selfSessionInAnotherRoom = activeSessions.find((s) => {
        if (s.practitionerId !== practitioner.id) return false;
        if (s.roomId === query.roomId) return false;
        const sStart = parseClockTime(s.startTime.slice(0, 5));
        const sEnd = parseClockTime(s.endTime.slice(0, 5));
        return sStart < slotEndMin && sEnd > slotStartMin;
      });

      if (selfSessionInAnotherRoom) {
        const selfRoomName =
          selfSessionInAnotherRoom.clinicRoom?.name || 'ruangan lain';
        slots.push({
          slotIndex: i,
          time: slotStartTime,
          endTime: slotEndTime,
          isAvailable: false,
          status: SCHEDULE_SLOT_STATUS.OCCUPIED_BY_SELF,
          displayLabel: 'Jadwal Anda',
          conflict: {
            type: SCHEDULE_SLOT_CONFLICT_TYPE.PRACTITIONER_OVERLAP,
            occupantName: doctorName,
            reason: `Anda telah memiliki jadwal pada jam ${selfSessionInAnotherRoom.startTime.slice(0, 5)} - ${selfSessionInAnotherRoom.endTime.slice(0, 5)} di ${selfRoomName}.`,
          },
        });
        continue;
      }

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
        const otherPractitionerId =
          otherSession.practitioner?.staffProfile?.id ||
          otherSession.practitionerId;
        slots.push({
          slotIndex: i,
          time: slotStartTime,
          endTime: slotEndTime,
          isAvailable: false,
          status: SCHEDULE_SLOT_STATUS.OCCUPIED_BY_OTHER,
          displayLabel: otherDoctorName,
          conflict: {
            type: SCHEDULE_SLOT_CONFLICT_TYPE.ROOM_OCCUPIED,
            occupantName: otherDoctorName,
            practitionerId: otherPractitionerId,
            reason: `${roomName} sudah dialokasikan untuk ${otherDoctorName} pada jam ${otherSession.startTime.slice(0, 5)} - ${otherSession.endTime.slice(0, 5)}.`,
          },
        });
        continue;
      }

      // Priority 5: Active Patient Appointment in this Slot
      const occupiedAppointment = activeAppointments.find((a) => {
        const aStart = parseClockTime(a.scheduledStartTime.slice(0, 5));
        const aEnd = a.scheduledEndTime
          ? parseClockTime(a.scheduledEndTime.slice(0, 5))
          : aStart + intervalMinutes;
        const isThisDoctor = a.practitionerId === practitioner.id;
        const isThisRoom = a.roomId === query.roomId;
        return (
          (isThisDoctor || isThisRoom) &&
          aStart < slotEndMin &&
          aEnd > slotStartMin
        );
      });

      if (occupiedAppointment) {
        const patientName =
          occupiedAppointment.patientProfile?.fullName || 'Pasien';
        slots.push({
          slotIndex: i,
          time: slotStartTime,
          endTime: slotEndTime,
          isAvailable: false,
          status: SCHEDULE_SLOT_STATUS.OCCUPIED_BY_SELF,
          displayLabel: `Terisi: ${patientName}`,
          conflict: {
            type: SCHEDULE_SLOT_CONFLICT_TYPE.PRACTITIONER_OVERLAP,
            occupantName: patientName,
            reason: `Slot sudah terisi oleh janji temu pasien ${patientName}.`,
          },
        });
        continue;
      }

      slots.push({
        slotIndex: i,
        time: slotStartTime,
        endTime: slotEndTime,
        isAvailable: true,
        status: SCHEDULE_SLOT_STATUS.AVAILABLE,
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

import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../../database/drizzle/drizzle.provider';
import {
  clinicRooms,
  clinicUnits,
  medicalSpecialties,
  practitionerScheduleSessions,
} from '../../../../../../database/schema';
import { SCHEDULE_CONTEXT_DEFINITIONS } from '../../../../domain/constants/schedule-context.constants';
import {
  type ClinicRoomReferenceEntity,
  ScheduleOperationalStatus,
  type ScheduleOptionsReferenceEntity,
} from '../../../../domain/entities/schedule.entity';
import { SchedulePersistenceStatus } from '../../../../domain/schedule-status';
import { SchedulePolicyReader } from '../../queries/schedule-policy.reader';

@Injectable()
export class DrizzleScheduleReferenceRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly policyReader: SchedulePolicyReader,
  ) {}

  async getRooms(
    date?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<ClinicRoomReferenceEntity[]> {
    const rooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
      orderBy: [asc(clinicRooms.floor), asc(clinicRooms.name)],
    });

    if (!date || !startTime || !endTime) {
      return rooms.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        location: r.location,
        floor: r.floor,
        isOccupied: false,
        occupiedBy: null,
      }));
    }

    const formattedStart =
      startTime.length === 5 ? `${startTime}:00` : startTime;
    const formattedEnd = endTime.length === 5 ? `${endTime}:00` : endTime;

    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(
        eq(practitionerScheduleSessions.scheduleDate, date),
        eq(practitionerScheduleSessions.status, SchedulePersistenceStatus.OPEN),
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

    return rooms.map((r) => {
      const activeSession = sessions.find((s) => {
        if (s.roomId !== r.id) return false;
        const sessStart =
          s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime;
        const sessEnd = s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime;
        return formattedStart < sessEnd && formattedEnd > sessStart;
      });

      if (activeSession) {
        const docName =
          activeSession.practitioner?.staffProfile?.fullName ||
          activeSession.practitioner?.displayName ||
          'Dokter';
        const range = `${activeSession.startTime.slice(0, 5)} - ${activeSession.endTime.slice(0, 5)} WIB`;
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          location: r.location,
          floor: r.floor,
          isOccupied: true,
          occupiedBy: `${docName} (${range})`,
        };
      }

      return {
        id: r.id,
        code: r.code,
        name: r.name,
        location: r.location,
        floor: r.floor,
        isOccupied: false,
        occupiedBy: null,
      };
    });
  }

  async getPolikliniks(): Promise<
    { id: string; code: string; name: string; location?: string | null }[]
  > {
    const units = await this.db.query.clinicUnits.findMany({
      where: eq(clinicUnits.isActive, true),
      orderBy: [asc(clinicUnits.name)],
    });

    return units.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      location: u.location || null,
    }));
  }

  async getScheduleOptions(): Promise<ScheduleOptionsReferenceEntity> {
    const clinicPolicy = await this.policyReader.getClinicSchedulePolicy();
    return {
      shifts: SCHEDULE_CONTEXT_DEFINITIONS.map((def) => ({
        id: def.shift.toUpperCase(),
        label: def.label,
        shift: def.shift,
        startTime: def.boundaryStartTime,
        endTime: def.boundaryEndTime,
      })),
      statuses: [
        { id: 'OPEN', label: 'Buka' },
        { id: 'CLOSED', label: 'Tutup' },
      ],
      timeSlotIntervals: [clinicPolicy.durationMinutes],
      effectiveConsultationDurationMinutes: clinicPolicy.durationMinutes,
      durationSource: 'CLINIC_CONFIG',
      durationScope: 'clinic-default',
      canonicalIntervalStatuses: [
        { id: 'OPEN', label: 'Buka' },
        { id: 'OCCUPIED', label: 'Terisi' },
        { id: 'CLOSED', label: 'Tutup' },
      ],
    };
  }

  async getAdminDoctorScheduleFilterOptions(): Promise<any> {
    const [units, specs] = await Promise.all([
      this.db.query.clinicUnits.findMany({
        where: eq(clinicUnits.isActive, true),
        orderBy: [asc(clinicUnits.name)],
      }),
      this.db.query.medicalSpecialties.findMany({
        orderBy: [asc(medicalSpecialties.name)],
      }),
    ]);

    return {
      success: true,
      data: {
        poliklinik: units.map((u) => ({
          id: u.id,
          name: u.name,
          code: u.code,
        })),
        spesialisasi: specs.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
        })),
        statuses: [
          { id: ScheduleOperationalStatus.OPEN, label: 'Buka' },
          { id: ScheduleOperationalStatus.OCCUPIED, label: 'Terisi' },
          { id: ScheduleOperationalStatus.CLOSED, label: 'Tutup' },
        ],
      },
    };
  }
}

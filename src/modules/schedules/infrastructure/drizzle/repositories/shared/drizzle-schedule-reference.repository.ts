import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicRooms,
  clinicUnits,
  medicalSpecialties,
} from '@database/schema';
import { SCHEDULE_CONTEXT_DEFINITIONS } from '@modules/schedules/domain/constants/schedule-context.constants';
import {
  type ClinicRoomReferenceEntity,
  ScheduleOperationalStatus,
  type ScheduleOptionsReferenceEntity,
} from '@modules/schedules/domain/entities/schedule.entity';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleReferenceRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly policyReader: SchedulePolicyReader,
  ) {}

  async getRooms(
    _date?: string,
    _startTime?: string,
    _endTime?: string,
    _excludePractitionerId?: string,
  ): Promise<ClinicRoomReferenceEntity[]> {
    const rooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
      orderBy: [asc(clinicRooms.floor), asc(clinicRooms.name)],
    });

    return rooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      location: r.location,
      floor: r.floor,
      isOccupied: false,
      occupiedBy: null,
      occupantDetails: null,
    }));
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
        timeRange: `${def.boundaryStartTime} - ${def.boundaryEndTime}`,
        startHour: Math.floor(def.boundaryStartMinutes / 60),
        endHour: Math.floor(def.boundaryEndMinutes / 60),
        totalSlots: Math.floor(
          (def.boundaryEndMinutes - def.boundaryStartMinutes) / clinicPolicy.durationMinutes,
        ),
        durationMinutes: clinicPolicy.durationMinutes,
        precisionMinutes: clinicPolicy.startPrecisionMinutes,
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
      slotStatuses: [
        { id: 'AVAILABLE', label: 'Tersedia' },
        { id: 'PAST', label: 'Sudah Selesai' },
        { id: 'OCCUPIED_BY_OTHER', label: 'Terisi Dokter Lain' },
        { id: 'OCCUPIED_BY_SELF', label: 'Jadwal Anda' },
        { id: 'CLOSED_LEAVE', label: 'Cuti' },
      ],
      slotConflictTypes: [
        { id: 'TEMPORAL_PAST', label: 'Waktu Berlalu' },
        { id: 'ROOM_OCCUPIED', label: 'Ruangan Terisi' },
        { id: 'PRACTITIONER_OVERLAP', label: 'Bentrok Jadwal Dokter' },
        { id: 'LEAVE', label: 'Cuti Dokter' },
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

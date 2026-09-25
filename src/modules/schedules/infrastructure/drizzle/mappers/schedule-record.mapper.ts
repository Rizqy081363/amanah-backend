import { generateEntityVersion } from '../../../../../common/occ';
import {
  type ScheduleEntity,
  ScheduleOperationalStatus,
} from '../../../domain/entities/schedule.entity';
import type { SessionShiftType } from '../../../domain/factories/schedule-slot.factory';
import { resolveSessionOperationalStatus } from '../../../domain/schedule-status';

type StaffProfileRecord = {
  fullName?: string | null;
  positionTitle?: string | null;
  primaryUnitId?: string | null;
  avatarUrl?: string | null;
  clinicUnit?: {
    name?: string | null;
  } | null;
};

type PractitionerRecord = {
  id?: string | null;
  staffProfileId?: string | null;
  displayName?: string | null;
  staffProfile?: StaffProfileRecord | null;
};

type ClinicRoomRecord = {
  name?: string | null;
  unitId?: string | null;
  clinicUnit?: {
    name?: string | null;
  } | null;
};

type ClinicServiceRecord = {
  name?: string | null;
};

export type ScheduleRecordMapperInput = {
  id: string;
  practitionerId: string;
  scheduleDate: string;
  sessionLabel?: string | null;
  sessionShift: SessionShiftType | null;
  startTime: string;
  endTime: string;
  roomId?: string | null;
  serviceId?: string | null;
  capacity: number;
  availableSlots: number;
  status: string;
  notes?: string | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
  practitioner?: PractitionerRecord | null;
  clinicRoom?: ClinicRoomRecord | null;
  clinicService?: ClinicServiceRecord | null;
};

const RESCHEDULE_CLOSED_REASON =
  'Sesi ini berstatus Tutup. Silakan aktifkan sesi terlebih dahulu melalui menu Ubah Sesi sebelum melakukan reschedule.';

export function mapScheduleRecordToEntity(
  record: ScheduleRecordMapperInput,
): ScheduleEntity {
  const shift = record.sessionShift;
  const sessionName =
    shift === 'afternoon' ? 'SIANG' : shift === 'night' ? 'MALAM' : 'PAGI';
  const sessionLabel =
    record.sessionLabel ||
    (shift === 'afternoon' ? 'Siang' : shift === 'night' ? 'Malam' : 'Pagi');

  const startTimeFormatted = record.startTime
    ? record.startTime.slice(0, 5)
    : null;
  const endTimeFormatted = record.endTime ? record.endTime.slice(0, 5) : null;
  const timeRange =
    startTimeFormatted && endTimeFormatted
      ? `${startTimeFormatted} - ${endTimeFormatted} WIB`
      : undefined;

  const capacity = record.capacity ?? 0;
  const availableSlots = record.availableSlots ?? capacity;
  const bookedPatientCount = Math.max(0, capacity - availableSlots);
  const operationalStatus = resolveSessionOperationalStatus({
    isClosedForLeave: false,
    availableSlots,
    persistedStatus: record.status,
  });
  const isAvailable = operationalStatus === ScheduleOperationalStatus.OPEN;

  return {
    id: record.id,
    staffId: record.practitioner?.staffProfileId || record.practitionerId,
    staffName:
      record.practitioner?.staffProfile?.fullName ||
      record.practitioner?.displayName ||
      'Dokter Amanah',
    profession:
      record.practitioner?.staffProfile?.positionTitle || 'Dokter Umum',
    scheduleDate: record.scheduleDate,
    specificDate: record.scheduleDate,
    poliklinikId:
      record.clinicRoom?.unitId ||
      record.practitioner?.staffProfile?.primaryUnitId ||
      null,
    poliklinikName:
      record.clinicRoom?.clinicUnit?.name ||
      record.practitioner?.staffProfile?.clinicUnit?.name ||
      'Poliklinik',
    serviceId: record.serviceId || null,
    serviceName: record.clinicService?.name || null,
    dayOfWeek: null,
    session: sessionName,
    sessionLabel,
    sessionShift: shift,
    startTime: startTimeFormatted,
    endTime: endTimeFormatted,
    timeRange,
    roomId: record.roomId || null,
    roomName:
      record.clinicRoom?.name || (record.roomId ? 'Ruang Praktek' : null),
    capacity,
    availableSlots,
    bookedPatientCount,
    status: operationalStatus,
    rawStatus: record.status,
    isAvailable,
    notes: record.notes || null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    doctorId:
      record.practitionerId || record.practitioner?.staffProfileId || undefined,
    practitionerId: record.practitionerId,
    isRescheduleEligible: isAvailable,
    is_reschedule_eligible: isAvailable,
    rescheduleIneligibilityReason: !isAvailable
      ? RESCHEDULE_CLOSED_REASON
      : null,
    reschedule_ineligibility_reason: !isAvailable
      ? RESCHEDULE_CLOSED_REASON
      : null,
    version: generateEntityVersion(record.updatedAt),
  };
}

export class ScheduleRecordMapper {
  static toAvatarUrl(
    staffProfile?: { avatarUrl?: string | null } | null,
  ): string {
    return staffProfile?.avatarUrl ?? '';
  }

  static toEntity(record: ScheduleRecordMapperInput): ScheduleEntity {
    return mapScheduleRecordToEntity(record);
  }
}

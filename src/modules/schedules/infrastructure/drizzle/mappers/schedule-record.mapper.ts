import { generateEntityVersion } from '@common/occ';
import {
  type CanonicalStaffShift,
  SHIFT_DISPLAY_LABELS,
  SHIFT_TO_SESSION_MAP,
} from '@modules/schedules/domain/constants/schedule-shift.constants';
import {
  type ScheduleEntity,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import type { SessionShiftType } from '@modules/schedules/domain/factories/schedule-session.factory';
import { parseClockTime } from '@modules/schedules/domain/schedule-projection';
import { resolveSessionOperationalStatus } from '@modules/schedules/domain/schedule-status';

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
  const shift = record.sessionShift as CanonicalStaffShift;
  const sessionName = shift ? SHIFT_TO_SESSION_MAP[shift] || 'PAGI' : 'PAGI';
  const sessionLabel =
    record.sessionLabel ||
    (shift ? SHIFT_DISPLAY_LABELS[shift] || 'Pagi' : 'Pagi');

  const startTimeFormatted = record.startTime
    ? record.startTime.slice(0, 5)
    : null;
  const endTimeFormatted = record.endTime ? record.endTime.slice(0, 5) : null;
  const timeRange =
    startTimeFormatted && endTimeFormatted
      ? `${startTimeFormatted} - ${endTimeFormatted} WIB`
      : undefined;

  const operationalStatus = resolveSessionOperationalStatus({
    isClosedForLeave: false,
    persistedStatus: record.status,
  });
  const isAvailable = operationalStatus === ScheduleOperationalStatus.OPEN;

  const now = new Date();
  const wibTime = new Date(
    now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000,
  );
  const todayStr = wibTime.toISOString().slice(0, 10);
  const currentMinutes = wibTime.getHours() * 60 + wibTime.getMinutes();
  const isPastDate = record.scheduleDate < todayStr;
  const isToday = record.scheduleDate === todayStr;
  const endMinutes = endTimeFormatted ? parseClockTime(endTimeFormatted) : 1440;
  const isPast = isPastDate || (isToday && endMinutes <= currentMinutes);

  let statusBadge = 'Buka';
  let badgeVariant = 'success';
  let effectiveStatus = ScheduleOperationalStatus.OPEN;

  if (!isAvailable) {
    statusBadge = 'Tutup';
    badgeVariant = 'warning';
    effectiveStatus = ScheduleOperationalStatus.CLOSED;
  } else if (isPast) {
    statusBadge = 'Selesai';
    badgeVariant = 'warning';
    effectiveStatus = ScheduleOperationalStatus.CLOSED;
  }

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
      null,
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
    roomName: record.clinicRoom?.name || null,
    status: operationalStatus,
    rawStatus: record.status,
    isAvailable,
    isPast,
    statusBadge,
    badgeVariant,
    effectiveStatus,
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

import { generateEntityVersion } from '@common/occ';
import type { CanonicalStaffShift } from '@modules/schedules/domain/constants/schedule-shift.constants';
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
  role?: {
    code?: string | null;
    name?: string | null;
  } | null;
  clinicUnit?: {
    name?: string | null;
  } | null;
};

type PractitionerRecord = {
  id?: string | null;
  staffProfileId?: string | null;
  displayName?: string | null;
  medicalSpecialty?: {
    name?: string | null;
  } | null;
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
  sessionId?: string | null;
  practitionerId: string;
  scheduleDate: string;
  sessionLabel?: string | null;
  sessionShift: SessionShiftType | null;
  startTime?: string | null;
  endTime?: string | null;
  roomId?: string | null;
  serviceId?: string | null;
  status: string;
  notes?: string | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
  practitioner?: PractitionerRecord | null;
  clinicRoom?: ClinicRoomRecord | null;
  clinicService?: ClinicServiceRecord | null;
  isReplacement?: boolean;
  replacedStaffName?: string | null;
};

const RESCHEDULE_CLOSED_REASON =
  'Sesi ini berstatus Tutup. Silakan aktifkan sesi terlebih dahulu melalui menu Ubah Sesi sebelum melakukan reschedule.';

function mapScheduleRecordToEntity(
  record: ScheduleRecordMapperInput,
): ScheduleEntity {
  const shift = record.sessionShift
    ? (record.sessionShift as CanonicalStaffShift)
    : null;
  const sessionName = (shift ?? '') as CanonicalStaffShift;
  const sessionLabel = record.sessionLabel || undefined;

  const startTimeFormatted = record.startTime
    ? record.startTime.slice(0, 5)
    : null;
  const endTimeFormatted = record.endTime ? record.endTime.slice(0, 5) : null;
  const timeRange =
    startTimeFormatted && endTimeFormatted
      ? `${startTimeFormatted} - ${endTimeFormatted} WIB`
      : undefined;

  const operationalStatus = record.isReplacement
    ? ScheduleOperationalStatus.REPLACEMENT
    : resolveSessionOperationalStatus({
        isClosedForLeave: false,
        persistedStatus: record.status,
      });
  const isAvailable =
    operationalStatus === ScheduleOperationalStatus.OPEN ||
    operationalStatus === ScheduleOperationalStatus.REPLACEMENT;

  const now = new Date();
  const wibTime = new Date(
    now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000,
  );
  const todayStr = wibTime.toISOString().slice(0, 10);
  const currentMinutes = wibTime.getHours() * 60 + wibTime.getMinutes();
  const isPastDate = record.scheduleDate < todayStr;
  const isToday = record.scheduleDate === todayStr;
  const startMinutes = startTimeFormatted ? parseClockTime(startTimeFormatted) : 0;
  let endMinutes = endTimeFormatted ? parseClockTime(endTimeFormatted) : 1440;
  if (endMinutes <= startMinutes) {
    endMinutes += 1440;
  }
  const isPast = isPastDate || (isToday && endMinutes <= currentMinutes);

  let effectiveStatus = record.isReplacement
    ? ScheduleOperationalStatus.REPLACEMENT
    : ScheduleOperationalStatus.OPEN;
  let statusBadge = record.isReplacement
    ? ScheduleOperationalStatus.REPLACEMENT
    : ScheduleOperationalStatus.OPEN;
  let badgeVariant = record.isReplacement ? 'trend' : 'success';

  if (!record.isReplacement && (!isAvailable || isPast)) {
    effectiveStatus = ScheduleOperationalStatus.CLOSED;
    statusBadge = ScheduleOperationalStatus.CLOSED;
    badgeVariant = 'warning';
  }

  return {
    id: record.id,
    sessionId: record.sessionId || null,
    staffId: record.practitioner?.staffProfileId || record.practitionerId,
    staffName:
      record.practitioner?.staffProfile?.fullName ||
      record.practitioner?.displayName ||
      '',
    profession: record.practitioner?.medicalSpecialty?.name ?? '',
    roleCode: record.practitioner?.staffProfile?.role?.code ?? null,
    roleName: record.practitioner?.staffProfile?.role?.name ?? null,
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
    isReplacement: record.isReplacement ?? false,
    replacedStaffName: record.replacedStaffName ?? null,
    isRescheduleEligible: isAvailable && !record.isReplacement,
    rescheduleIneligibilityReason: !isAvailable
      ? RESCHEDULE_CLOSED_REASON
      : record.isReplacement
        ? 'Dinas pengganti tidak dapat di-reschedule secara manual'
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

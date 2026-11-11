import {
  attendanceMethod,
  attendanceQrSessionType,
  attendanceStatus,
} from '../../../../database/schema/amanah.schema';

export type ShiftCode = string;

export const ATTENDANCE_ACTIONS = {
  CHECK_IN: 'check_in',
  MANUAL_CHECK_IN: 'manual_check_in',
  CHECK_OUT: 'check_out',
  ABSENCE_FINALIZED: 'absence_finalized',
  RECONCILED: 'reconciled',
} as const;

export type AttendanceAction =
  (typeof ATTENDANCE_ACTIONS)[keyof typeof ATTENDANCE_ACTIONS];

/**
 * Single Source of Truth directly from database schema enums
 */
export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  LATE: 'late',
  LEAVE: 'leave',
  ABSENT: 'absent',
  MISSED: 'missed',
} as const satisfies Record<
  string,
  (typeof attendanceStatus.enumValues)[number]
>;

export const ATTENDANCE_METHOD = {
  QR_SCAN: 'qr_scan',
  MANUAL_PIN: 'manual_pin',
  QR_UPLOAD: 'qr_upload',
  SYSTEM: 'system',
} as const satisfies Record<
  string,
  (typeof attendanceMethod.enumValues)[number]
>;

export const ATTENDANCE_QR_SESSION_TYPE = {
  LOCATION_CHECK_IN: 'location_check_in',
  STAFF_IDENTITY: 'staff_identity',
} as const satisfies Record<
  string,
  (typeof attendanceQrSessionType.enumValues)[number]
>;

export const RECONCILE_DECISION = {
  APPROVED_OVERTIME: 'approved_overtime',
  REJECTED_OVERTIME: 'rejected_overtime',
} as const;

export type ReconcileDecision =
  (typeof RECONCILE_DECISION)[keyof typeof RECONCILE_DECISION];

export const MILESTONE_STATUS = {
  PRESENT: 'present',
  LATE: 'late',
  ABSENT: 'absent',
  LEAVE: 'leave',
  ONGOING: 'ongoing',
  UPCOMING: 'upcoming',
} as const;

export const MILESTONE_STATUS_LABELS: Record<string, string> = {
  [MILESTONE_STATUS.PRESENT]: 'Hadir',
  [MILESTONE_STATUS.LATE]: 'Terlambat',
  [MILESTONE_STATUS.ABSENT]: 'Tidak Hadir',
  [MILESTONE_STATUS.LEAVE]: 'Izin / Cuti',
  [MILESTONE_STATUS.ONGOING]: 'Sedang Berjalan',
  [MILESTONE_STATUS.UPCOMING]: 'Belum Dimulai',
};

export type AttendanceMethod = (typeof attendanceMethod.enumValues)[number];
export const ATTENDANCE_METHODS = attendanceMethod.enumValues as unknown as [
  AttendanceMethod,
  ...AttendanceMethod[],
];

export const ATTENDANCE_STATUSES = attendanceStatus.enumValues;
export type AttendanceStatus = (typeof attendanceStatus.enumValues)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  [ATTENDANCE_STATUS.PRESENT]: 'Hadir',
  [ATTENDANCE_STATUS.LATE]: 'Terlambat',
  [ATTENDANCE_STATUS.LEAVE]: 'Izin / Cuti',
  [ATTENDANCE_STATUS.ABSENT]: 'Tidak Hadir',
  [ATTENDANCE_STATUS.MISSED]: 'Tidak Hadir',
};

export const ATTENDANCE_STATUS_VALUES =
  attendanceStatus.enumValues as unknown as [
    AttendanceStatus,
    ...AttendanceStatus[],
  ];

export function isValidShift(shift: string): boolean {
  return typeof shift === 'string' && shift.trim().length > 0;
}

export function isValidStatus(status: string): status is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(status);
}

/**
 * Normalizes shift string safely, preserving domain validity without inventing values.
 */
export function normalizeShift(rawShift?: string | null): string | undefined {
  if (rawShift) {
    const s = rawShift.trim();
    if (s.length > 0) {
      return s;
    }
  }
  return undefined;
}

/**
 * Normalizes status string safely, preserving domain validity without inventing values.
 */
export function normalizeStatus(
  rawStatus?: string | null,
): AttendanceStatus | undefined {
  if (rawStatus) {
    const s = rawStatus.trim().toLowerCase();
    if (isValidStatus(s)) {
      return s;
    }
  }
  return undefined;
}

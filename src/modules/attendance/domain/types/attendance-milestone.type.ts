export type AttendanceMilestoneStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'leave'
  | 'ongoing'
  | 'upcoming';

export interface StaffAttendanceMilestone {
  sessionId: string;
  shiftCode: string;
  shiftLabel: string;
  startsAt: string; // e.g. "07:00:00"
  endsAt: string; // e.g. "11:00:00"
  status: AttendanceMilestoneStatus;
  statusLabel: string; // "Hadir" | "Terlambat" | "Tidak Hadir" | "Izin / Cuti" | "Sedang Berjalan" | "Belum Dimulai"
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number | null;
  validatedDurationHours: number | null;
  attendanceRecordId: string | null;
  notes: string | null;
  isCurrentShift: boolean;
}

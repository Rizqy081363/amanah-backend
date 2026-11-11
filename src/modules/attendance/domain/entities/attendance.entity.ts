import type {
  AttendanceMethod,
  AttendanceStatus,
} from '../constants/attendance.constants';

export class AttendanceEntity {
  id: string;
  staffId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  recordedMethod: AttendanceMethod;
  isReplacement: boolean;
  isEarlyDeparture: boolean;
  locationLabel?: string | null;
  shift?: string | null;
  shiftLabel?: string | null;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  validatedDurationHours?: number | null;
  replacementOpportunityId?: string | null;
  replacedStaffName?: string | null;
  replacedStaffCode?: string | null;
  sessionId?: string | null;
  deviceInfo?: string | null;
  lateMinutes?: number | null;
  recordedBy?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

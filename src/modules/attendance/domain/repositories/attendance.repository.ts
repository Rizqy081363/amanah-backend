import { AttendanceEntity } from '../entities/attendance.entity';
import { QrSessionEntity } from '../entities/qr-session.entity';

export const ATTENDANCE_REPOSITORY = 'ATTENDANCE_REPOSITORY';

export type QRSessionInfo = QrSessionEntity;

export interface AttendanceBFFResponse {
  records: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    total_staf: number;
    staf_hadir: number;
    staf_tidak_hadir: number;
    tingkat_kehadiran: number;
    perubahan_total_staf: number;
    perubahan_staf_hadir: number;
    perubahan_staf_tidak_hadir: number;
    perubahan_tingkat_kehadiran: number;
    sparkline_total_staf: Array<{ label: string; value: number }>;
    sparkline_staf_hadir: Array<{ label: string; value: number }>;
    sparkline_staf_tidak_hadir: Array<{ label: string; value: number }>;
    sparkline_tingkat_kehadiran: Array<{ label: string; value: number }>;
  };
  qrConfig: {
    status_presensi: string;
    qr_code_identifier: string;
    qr_context: string;
    qr_validity: string;
    rotation_seconds: number;
    validUntil?: string;
    valid_until?: string;
  };
  availableFilters: {
    shifts: Array<{ label: string; value: string }>;
    statuses: Array<{ label: string; value: string }>;
    categories: Array<{ label: string; value: string }>;
  };
}

export interface AttendanceRepository {
  // Persistence operations
  saveAttendanceRecord(data: {
    staffProfileId: string;
    attendanceDate: string;
    shift: string;
    status: string;
    checkInAt: string;
    lateMinutes?: number | null;
    recordedMethod: string;
    sessionId?: string | null;
    qrSessionId?: string | null;
    isReplacement: boolean;
    replacementOpportunityId?: string | null;
    recordedBy?: string | null;
    notes?: string | null;
  }): Promise<AttendanceEntity>;

  updateAttendanceRecord(
    id: string,
    data: {
      checkOutAt?: string | null;
      validatedDurationHours?: string | null;
      updatedAt?: string;
    },
  ): Promise<AttendanceEntity>;

  findStaffAttendanceForDate(
    staffId: string,
    attendanceDate: string,
  ): Promise<AttendanceEntity | null>;

  findByStaffId(staffId: string, limit?: number): Promise<AttendanceEntity[]>;

  findDailyWithStaff(date: string): Promise<any[]>;

  // QR Session persistence
  createQrSession(data: {
    codeHash: string;
    sessionType: 'location_check_in' | 'staff_identity';
    shift: string;
    rotationSeconds: number;
    context: string;
    validFrom: string;
    validUntil: string;
    createdBy?: string | null;
  }): Promise<QrSessionEntity>;

  findActiveQrSession(sessionType?: string): Promise<QrSessionEntity | null>;

  findQrSessionByToken(token: string): Promise<QrSessionEntity | null>;

  // Roster, schedule, and eligibility lookups
  findApprovedLeave(staffId: string, dateStr: string): Promise<boolean>;

  findClaimedReplacement(
    staffId: string,
    dateStr: string,
  ): Promise<{ id: string } | null>;

  markReplacementCompleted(opportunityId: string): Promise<void>;

  findStaffRostersForDow(
    staffId: string,
    dow: number,
  ): Promise<Array<{ id: string; sessionId: string }>>;

  findDoctorAssignmentsForDow(
    staffId: string,
    dow: number,
  ): Promise<Array<{ id: string; sessionId: string }>>;

  findScheduledStaffCountByDow(dow: number): Promise<number>;

  resolveStaffByIdOrCode(
    query: string,
  ): Promise<{
    id: string;
    staffCode: string;
    fullName: string;
    userId: string | null;
    staffType?: string | null;
    avatarUrl?: string | null;
  } | null>;

  resolveSessionDefByTime(
    hour: number,
  ): Promise<{ id: string; code: string; defaultStartsAt: string | null } | null>;

  resolveSessionDefById(
    sessionId: string,
  ): Promise<{ id: string; code: string; defaultStartsAt: string | null } | null>;

  // Master days and historical trends from database
  getMasterDays(): Promise<Array<{
    dow: number;
    code: string;
    nameId: string;
    shortNameId: string;
    sortOrder: number;
  }>>;

  findWeeklyAttendanceCounts(
    startDate: string,
    endDate: string,
  ): Promise<Map<string, { presentCount: number; lateCount: number }>>;

  getAvailableFilterOptions(): Promise<{
    shifts: Array<{ label: string; value: string }>;
    statuses: Array<{ label: string; value: string }>;
    categories: Array<{ label: string; value: string }>;
  }>;
}

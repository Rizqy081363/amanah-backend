export class AttendanceEntity {
  id: string;
  staffId: string;
  shift: string;
  status: string;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  validatedDurationHours?: number;
  isReplacement: boolean;
  isEarlyDeparture?: boolean;
  replacementOpportunityId?: string | null;
  sessionId?: string | null;
  deviceInfo?: string | null;
  attendanceDate?: string;
  lateMinutes?: number | null;
  notes?: string | null;
  createdAt: Date;
}

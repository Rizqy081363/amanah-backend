import type { CanonicalStaffShift } from '../../../schedules/domain/constants/schedule-shift.constants';
import type {
  AppointmentAction,
  AppointmentStatus,
} from '../types/appointment.types';

export class AppointmentEntity {
  id: string;
  bookingCode?: string | null;
  medicalFlow?: string | null;
  patientId: string;
  patientUserId?: string | null;
  createdBy?: string | null;
  isAffiliated?: boolean;
  affiliationRelationship?: string | null;
  parentUserId?: string | null;
  parentUserName?: string | null;
  patientName?: string;
  avatarUrl?: string | null;
  poliklinikId: string;
  poliklinikName?: string;
  layananId: string;
  layananName?: string;
  staffId?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  doctorSpecialty?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  roomLocation?: string | null;
  appointmentDate: string;
  appointmentDateFormatted?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  estimatedDurationMinutes?: number;
  session: CanonicalStaffShift;
  sessionName?: string | null;
  queueNumber: string;
  ticketStatus?: string;
  status: AppointmentStatus;
  visitType: 'new_visit' | 'follow_up';
  complaint?: string | null;
  sourceIntakeId?: string | null;
  cancellationReason?: string | null;
  calledAt?: Date | null;
  lastCalledAt?: Date | null;
  checkedInAt?: Date | null;
  actualStartedAt?: Date | null;
  actualCompletedAt?: Date | null;
  consultationElapsedSeconds?: number | null;
  consultationDurationFormatted?: string | null;
  estimatedStartAt?: Date | null;
  estimatedEndAt?: Date | null;
  etaRange?: string | null;
  aheadCount?: number | null;
  completedAt?: Date | null;
  rawStatus?: string;
  allowedActions?: AppointmentAction[];
  createdAt: Date;
  updatedAt: Date;
  version?: string;
}

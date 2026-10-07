import type { CanonicalSessionName } from '../../../schedules/domain/constants/schedule-shift.constants';
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
  patientAvatarUrl?: string | null;
  poliklinikId: string;
  poliklinikName?: string;
  layananId: string;
  layananName?: string;
  staffId?: string | null;
  doctorName?: string | null;
  doctorSpecialty?: string | null;
  doctorAvatarUrl?: string | null;
  roomName?: string | null;
  roomLocation?: string | null;
  appointmentDate: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  estimatedDurationMinutes?: number;
  session: CanonicalSessionName;
  queueNumber: string;
  ticketStatus?: string;
  status: AppointmentStatus;
  visitType: 'Pemeriksaan Baru' | 'Kontrol Ulang';
  complaint?: string | null;
  sourceIntakeId?: string | null;
  cancellationReason?: string | null;
  calledAt?: Date | null;
  lastCalledAt?: Date | null;
  actualStartedAt?: Date | null;
  actualCompletedAt?: Date | null;
  consultationElapsedSeconds?: number | null;
  consultationDurationFormatted?: string | null;
  estimatedStartAt?: Date | null;
  estimatedEndAt?: Date | null;
  completedAt?: Date | null;
  rawStatus?: string;
  allowedActions?: AppointmentAction[];
  createdAt: Date;
  updatedAt: Date;
  version?: string;
}

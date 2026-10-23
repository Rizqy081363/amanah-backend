import {
  DOCTOR_AVAILABILITY,
  type DoctorAvailability,
} from '../../../domain/constants/appointment-lifecycle.constants';

export { DOCTOR_AVAILABILITY, type DoctorAvailability };

export interface DoctorCandidateItem {
  id: string;
  name: string;
  avatarUrl?: string | null;
  specialty: string;
  staffType: string;
  availability: DoctorAvailability;
  existingSessionId: string | null;
  currentQueueCount?: number;
  isOnLeave?: boolean;
  leaveReason?: string | null;
  isReplacement?: boolean;
  replacingDoctorName?: string | null;
  attendanceStatus?:
    | 'checked_in'
    | 'not_checked_in'
    | 'late'
    | 'on_leave'
    | 'absent';
  attendanceWarning?: string | null;
}

export interface DoctorCandidateGroup {
  id: string;
  name: string;
  code?: string | null;
  doctors: DoctorCandidateItem[];
}

export interface DoctorCandidatesResult {
  appointmentId: string;
  currentDoctorId: string | null;
  scheduledDate: string;
  scheduledTime: string;
  groups: DoctorCandidateGroup[];
}

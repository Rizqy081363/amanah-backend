import {
  DOCTOR_AVAILABILITY,
  type DoctorAvailability,
} from '../../../domain/constants/appointment-lifecycle.constants';

export { DOCTOR_AVAILABILITY, type DoctorAvailability };

export interface DoctorCandidateItem {
  id: string;
  name: string;
  specialty: string;
  staffType: string;
  availability: DoctorAvailability;
  existingSessionId: string | null;
  currentQueueCount?: number;
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

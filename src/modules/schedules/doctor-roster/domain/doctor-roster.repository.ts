import {
  DoctorRosterOverviewResponse,
  DoctorScheduleHistoryResponse,
  UpdateDoctorRosterDto,
} from './doctor-roster.entity';

export const DOCTOR_ROSTER_REPOSITORY = 'DOCTOR_ROSTER_REPOSITORY';
export const DoctorRosterRepository = Symbol('DoctorRosterRepository');

export interface RecordScheduleHistoryParams {
  doctorId: string;
  scheduleDate?: string | null;
  sessionId?: string | null;
  dow?: number | null;
  action:
    | 'open_schedule'
    | 'close_schedule'
    | 'assign_roster'
    | 'remove_roster'
    | 'override_date';
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  metadata?: Record<string, any>;
  changedBy?: string | null;
}

export interface DoctorRosterRepository {
  getDoctorRoster(doctorId: string): Promise<DoctorRosterOverviewResponse>;
  updateDoctorRoster(
    doctorId: string,
    dto: UpdateDoctorRosterDto,
    userId?: string,
  ): Promise<DoctorRosterOverviewResponse>;
  getDoctorScheduleHistory(
    doctorId: string,
    limit?: number,
    offset?: number,
  ): Promise<DoctorScheduleHistoryResponse>;
  recordScheduleHistory(params: RecordScheduleHistoryParams): Promise<void>;
}

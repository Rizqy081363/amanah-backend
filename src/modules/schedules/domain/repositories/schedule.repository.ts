import { AdminDoctorScheduleDetailQueryDto } from '@modules/schedules/presentation/dto/admin-doctor-schedule-detail-query.dto';
import { AdminDoctorSchedulesQueryDto } from '@modules/schedules/presentation/dto/admin-doctor-schedules-query.dto';
import { CheckRescheduleEligibilityQueryDto } from '@modules/schedules/presentation/dto/check-reschedule-eligibility-query.dto';
import { ClinicalPractitionersQueryDto } from '@modules/schedules/presentation/dto/clinical-practitioners-query.dto';
import { CreateAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/create-admin-doctor-session.dto';
import { GetAdminDoctorPatientsQueryDto } from '@modules/schedules/presentation/dto/get-admin-doctor-patients-query.dto';
import { GetSessionPatientsQueryDto } from '@modules/schedules/presentation/dto/get-session-patients-query.dto';
import { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';
import { ScheduleCapacityQueryDto } from '@modules/schedules/presentation/dto/schedule-capacity-query.dto';
import { ScheduleProjectionQueryDto } from '@modules/schedules/presentation/dto/schedule-projection-query.dto';
import { UpdateAdminDoctorScheduleDto } from '@modules/schedules/presentation/dto/update-admin-doctor-schedule.dto';
import { UpdateAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/update-admin-doctor-session.dto';
import {
  AdminDoctorAccumulatedPatientsResponse,
  AdminDoctorScheduleDetailResponse,
  AdminDoctorScheduleListResponse,
  AdminSessionPatientsResponse,
  BookedPatientEntity,
  CalendarSummaryResponse,
  ClinicalPractitionerEntity,
  ClinicRoomReferenceEntity,
  DayScheduleSettingEntity,
  RescheduleEligibilityEntity,
  ScheduleAvailabilityMutationResponse,
  ScheduleCapacityOverviewData,
  ScheduleContextEntity,
  ScheduleEntity,
  ScheduleOptionsReferenceEntity,
  ScheduleProjectionEntity,
} from '../entities/schedule.entity';

export const SCHEDULE_REPOSITORY = 'SCHEDULE_REPOSITORY';
export const ScheduleRepository = Symbol('ScheduleRepository');

export interface ScheduleRepository {
  create(
    data: Omit<ScheduleEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ScheduleEntity>;
  findById(id: string): Promise<ScheduleEntity | null>;
  findAll(
    limit?: number,
    offset?: number,
    filters?: {
      poliklinikId?: string;
      staffId?: string;
      date?: string;
    },
  ): Promise<ScheduleEntity[]>;
  findByStaffId(staffId: string): Promise<ScheduleEntity[]>;
  findMySchedules(
    staffId: string,
    filters?: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<ScheduleEntity[]>;
  findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]>;
  update(
    id: string,
    data: Partial<ScheduleEntity>,
  ): Promise<ScheduleEntity | null>;
  toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null>;
  delete(id: string): Promise<boolean>;

  // Doctor Schedule Management ("Jadwal Dokter") methods
  getCalendarSummary(
    staffId: string,
    month: string,
  ): Promise<CalendarSummaryResponse>;
  getBookedPatients(
    sessionId?: string,
    date?: string,
    staffId?: string,
  ): Promise<BookedPatientEntity[]>;
  getRooms(
    date?: string,
    startTime?: string,
    endTime?: string,
    excludePractitionerId?: string,
  ): Promise<ClinicRoomReferenceEntity[]>;
  getPolikliniks(): Promise<
    { id: string; code: string; name: string; location?: string | null }[]
  >;
  getScheduleOptions(): Promise<ScheduleOptionsReferenceEntity>;
  getScheduleContexts(
    staffId: string,
    date: string,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleContextEntity[]>;
  projectAvailability(
    staffId: string,
    query: ScheduleProjectionQueryDto,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleProjectionEntity>;
  getCapacityOverview(
    staffId: string,
    query: ScheduleCapacityQueryDto,
  ): Promise<ScheduleCapacityOverviewData>;
  getBookingOptions(
    dateStr: string,
    poliklinikId?: string,
    staffId?: string,
  ): Promise<any>;

  // Admin & Patient Domain methods (BE-SCHED-001)
  findAdminDoctorSchedules(
    query: AdminDoctorSchedulesQueryDto,
  ): Promise<AdminDoctorScheduleListResponse>;
  findAdminDoctorScheduleDetail(
    id: string,
    query: AdminDoctorScheduleDetailQueryDto,
  ): Promise<AdminDoctorScheduleDetailResponse>;
  updateAdminDoctorSchedule(
    id: string,
    body: UpdateAdminDoctorScheduleDto,
  ): Promise<any>;
  updateAdminDayStatus(
    id: string,
    date: string,
    status: string,
    notes?: string,
  ): Promise<any>;
  createAdminDoctorSession(
    id: string,
    body: CreateAdminDoctorSessionDto,
  ): Promise<any>;
  deleteAdminDoctorSession(id: string, sessionId: string): Promise<any>;
  updateAdminDoctorSession(
    id: string,
    sessionId: string,
    body: UpdateAdminDoctorSessionDto,
  ): Promise<any>;
  rescheduleAdminDoctorSession(
    id: string,
    sessionId: string,
    body: RescheduleAdminDoctorSessionDto,
  ): Promise<any>;
  checkRescheduleEligibility(
    id: string,
    sessionId: string,
    query: CheckRescheduleEligibilityQueryDto,
  ): Promise<RescheduleEligibilityEntity>;
  getAdminDoctorScheduleFilterOptions(): Promise<any>;
  findClinicalPractitioners(
    query: ClinicalPractitionersQueryDto,
  ): Promise<ClinicalPractitionerEntity[]>;
  getAdminSessionPatients(
    practitionerId: string,
    sessionId: string,
    query: GetSessionPatientsQueryDto,
  ): Promise<AdminSessionPatientsResponse>;
  getAdminDoctorPatientsByDate(
    practitionerId: string,
    date: string,
    query: GetAdminDoctorPatientsQueryDto,
  ): Promise<AdminDoctorAccumulatedPatientsResponse>;
}

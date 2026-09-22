import { AdminDoctorScheduleDetailQueryDto } from '../../presentation/dto/admin-doctor-schedule-detail-query.dto';
import { AdminDoctorSchedulesQueryDto } from '../../presentation/dto/admin-doctor-schedules-query.dto';
import { ClinicalPractitionersQueryDto } from '../../presentation/dto/clinical-practitioners-query.dto';
import { CreateAdminDoctorSessionDto } from '../../presentation/dto/create-admin-doctor-session.dto';
import { UpdateAdminDoctorScheduleDto } from '../../presentation/dto/update-admin-doctor-schedule.dto';
import { UpdateAdminDoctorSessionDto } from '../../presentation/dto/update-admin-doctor-session.dto';
import {
  AdminDoctorScheduleDetailResponse,
  AdminDoctorScheduleListResponse,
  BookedPatientEntity,
  CalendarSummaryResponse,
  ClinicalPractitionerEntity,
  ClinicRoomReferenceEntity,
  DayScheduleSettingEntity,
  ScheduleEntity,
  ScheduleOptionsReferenceEntity,
} from '../entities/schedule.entity';

export const SCHEDULE_REPOSITORY = 'SCHEDULE_REPOSITORY';

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
  getDaySettings(
    staffId: string,
    date: string,
  ): Promise<DayScheduleSettingEntity>;
  upsertDaySettings(
    staffId: string,
    date: string,
    data: {
      targetQuota?: number;
      isCuti?: boolean;
      cutiReason?: string | null;
      userId?: string;
    },
  ): Promise<DayScheduleSettingEntity>;
  getBookedPatients(
    sessionId?: string,
    date?: string,
    staffId?: string,
  ): Promise<BookedPatientEntity[]>;
  getRooms(
    date?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<ClinicRoomReferenceEntity[]>;
  getPolikliniks(): Promise<
    { id: string; code: string; name: string; location?: string | null }[]
  >;
  getScheduleOptions(): Promise<ScheduleOptionsReferenceEntity>;

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
  deleteAdminDoctorSession(
    id: string,
    sessionId: string,
  ): Promise<any>;
  updateAdminDoctorSession(
    id: string,
    sessionId: string,
    body: UpdateAdminDoctorSessionDto,
  ): Promise<any>;
  getAdminDoctorScheduleFilterOptions(): Promise<any>;
  findClinicalPractitioners(
    query: ClinicalPractitionersQueryDto,
  ): Promise<ClinicalPractitionerEntity[]>;
}

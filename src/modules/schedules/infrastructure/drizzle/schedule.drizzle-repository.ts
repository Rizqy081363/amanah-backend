import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import type { NotificationPublisher } from '@modules/notifications/contracts/domain-event.interface';
import { NOTIFICATION_PUBLISHER } from '@modules/notifications/notifications.constants';
import type {
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
  ScheduleContextEntity,
  ScheduleEntity,
  ScheduleOccupancyOverviewData,
  ScheduleOptionsReferenceEntity,
  ScheduleProjectionEntity,
} from '@modules/schedules/domain/entities/schedule.entity';
import type { ScheduleRepository } from '@modules/schedules/domain/repositories/schedule.repository';
import type { AdminDoctorScheduleDetailQueryDto } from '@modules/schedules/presentation/dto/admin-doctor-schedule-detail-query.dto';
import type { AdminDoctorSchedulesQueryDto } from '@modules/schedules/presentation/dto/admin-doctor-schedules-query.dto';
import type { CheckRescheduleEligibilityQueryDto } from '@modules/schedules/presentation/dto/check-reschedule-eligibility-query.dto';
import type { ClinicalPractitionersQueryDto } from '@modules/schedules/presentation/dto/clinical-practitioners-query.dto';
import type { CreateAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/create-admin-doctor-session.dto';
import type { GetAdminDoctorPatientsQueryDto } from '@modules/schedules/presentation/dto/get-admin-doctor-patients-query.dto';
import type { GetSessionPatientsQueryDto } from '@modules/schedules/presentation/dto/get-session-patients-query.dto';
import type { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';
import type { ScheduleOccupancyQueryDto } from '@modules/schedules/presentation/dto/schedule-occupancy-query.dto';
import type { ScheduleProjectionQueryDto } from '@modules/schedules/presentation/dto/schedule-projection-query.dto';
import type { UpdateAdminDoctorScheduleDto } from '@modules/schedules/presentation/dto/update-admin-doctor-schedule.dto';
import type { UpdateAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/update-admin-doctor-session.dto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { AppointmentOccupationQuery } from './queries/appointment-occupation.query';
import { ScheduleConflictQuery } from './queries/schedule-conflict.query';
import { SchedulePolicyReader } from './queries/schedule-policy.reader';
import {
  DrizzleAdminDoctorScheduleDetailQuery,
  DrizzleAdminDoctorScheduleListQuery,
  DrizzleAdminScheduleMutationRepository,
  DrizzleClinicalPractitionerRepository,
  DrizzleScheduleAvailabilityRepository,
  DrizzleScheduleDayRepository,
  DrizzleScheduleOccupancyRepository,
  DrizzleSchedulePatientRepository,
  DrizzleScheduleReferenceRepository,
  DrizzleScheduleRescheduleRepository,
  DrizzleScheduleSessionRepository,
} from './repositories';
import { PractitionerResolver } from './resolvers/practitioner.resolver';
import { RoomResolver } from './resolvers/room.resolver';

@Injectable()
export class ScheduleDrizzleRepository implements ScheduleRepository {
  private readonly sessionRepo: DrizzleScheduleSessionRepository;
  private readonly dayRepo: DrizzleScheduleDayRepository;
  private readonly refRepo: DrizzleScheduleReferenceRepository;
  private readonly availabilityRepo: DrizzleScheduleAvailabilityRepository;
  private readonly occupancyRepo: DrizzleScheduleOccupancyRepository;
  private readonly rescheduleRepo: DrizzleScheduleRescheduleRepository;
  private readonly patientRepo: DrizzleSchedulePatientRepository;
  private readonly clinicalPractitionerRepo: DrizzleClinicalPractitionerRepository;
  private readonly adminListQuery: DrizzleAdminDoctorScheduleListQuery;
  private readonly adminDetailQuery: DrizzleAdminDoctorScheduleDetailQuery;
  private readonly adminMutationRepo: DrizzleAdminScheduleMutationRepository;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    db: DrizzleDatabase,
    @Optional()
    @Inject(NOTIFICATION_PUBLISHER)
    notificationPublisher?: NotificationPublisher,
    @Optional() rescheduleRepo?: DrizzleScheduleRescheduleRepository,
    @Optional() practitionerResolver?: PractitionerResolver,
    @Optional() roomResolver?: RoomResolver,
    @Optional() policyReader?: SchedulePolicyReader,
    @Optional() conflictQuery?: ScheduleConflictQuery,
    @Optional() occupationQuery?: AppointmentOccupationQuery,
    @Optional() sessionRepo?: DrizzleScheduleSessionRepository,
    @Optional() dayRepo?: DrizzleScheduleDayRepository,
    @Optional() refRepo?: DrizzleScheduleReferenceRepository,
    @Optional() availabilityRepo?: DrizzleScheduleAvailabilityRepository,
    @Optional() occupancyRepo?: DrizzleScheduleOccupancyRepository,
    @Optional() patientRepo?: DrizzleSchedulePatientRepository,
    @Optional()
    clinicalPractitionerRepo?: DrizzleClinicalPractitionerRepository,
    @Optional() adminListQuery?: DrizzleAdminDoctorScheduleListQuery,
    @Optional() adminDetailQuery?: DrizzleAdminDoctorScheduleDetailQuery,
    @Optional() adminMutationRepo?: DrizzleAdminScheduleMutationRepository,
  ) {
    const resolvedPractitioner =
      practitionerResolver ?? new PractitionerResolver(db);
    const resolvedRoom = roomResolver ?? new RoomResolver(db);
    const resolvedPolicy = policyReader ?? new SchedulePolicyReader(db);
    const resolvedConflict = conflictQuery ?? new ScheduleConflictQuery(db);
    const resolvedOccupation =
      occupationQuery ?? new AppointmentOccupationQuery(db);

    this.sessionRepo =
      sessionRepo ??
      new DrizzleScheduleSessionRepository(
        db,
        resolvedPractitioner,
        resolvedConflict,
      );
    this.dayRepo =
      dayRepo ?? new DrizzleScheduleDayRepository(db, resolvedPractitioner);
    this.refRepo =
      refRepo ?? new DrizzleScheduleReferenceRepository(db, resolvedPolicy);
    this.availabilityRepo =
      availabilityRepo ??
      new DrizzleScheduleAvailabilityRepository(
        db,
        resolvedPractitioner,
        resolvedRoom,
        resolvedPolicy,
        resolvedConflict,
        resolvedOccupation,
      );
    this.occupancyRepo =
      occupancyRepo ??
      new DrizzleScheduleOccupancyRepository(
        db,
        resolvedPractitioner,
        resolvedPolicy,
      );
    this.rescheduleRepo =
      rescheduleRepo ??
      new DrizzleScheduleRescheduleRepository(
        db,
        notificationPublisher,
        resolvedPractitioner,
        resolvedConflict,
        this.availabilityRepo,
      );
    if (this.rescheduleRepo && notificationPublisher) {
      this.rescheduleRepo.setNotificationPublisher(notificationPublisher);
    }
    this.patientRepo =
      patientRepo ??
      new DrizzleSchedulePatientRepository(db, resolvedPractitioner);
    this.clinicalPractitionerRepo =
      clinicalPractitionerRepo ?? new DrizzleClinicalPractitionerRepository(db);
    this.adminListQuery =
      adminListQuery ??
      new DrizzleAdminDoctorScheduleListQuery(db, resolvedPolicy);
    this.adminDetailQuery =
      adminDetailQuery ??
      new DrizzleAdminDoctorScheduleDetailQuery(
        db,
        resolvedPractitioner,
        resolvedPolicy,
      );
    this.adminMutationRepo =
      adminMutationRepo ??
      new DrizzleAdminScheduleMutationRepository(
        db,
        resolvedPractitioner,
        resolvedRoom,
        resolvedConflict,
        this.adminDetailQuery,
      );
  }

  // Session CRUD
  create(
    data: Omit<ScheduleEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ScheduleEntity> {
    return this.sessionRepo.create(data);
  }

  findById(id: string): Promise<ScheduleEntity | null> {
    return this.sessionRepo.findById(id);
  }

  findAll(
    limit = 20,
    offset = 0,
    filters?: {
      poliklinikId?: string;
      staffId?: string;
      date?: string;
    },
  ): Promise<ScheduleEntity[]> {
    return this.sessionRepo.findAll(limit, offset, filters);
  }

  findByStaffId(staffId: string): Promise<ScheduleEntity[]> {
    return this.sessionRepo.findByStaffId(staffId);
  }

  findMySchedules(
    staffId: string,
    filters?: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<ScheduleEntity[]> {
    return this.sessionRepo.findMySchedules(staffId, filters);
  }

  findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]> {
    return this.sessionRepo.findByPoliAndDate(poliklinikId, date);
  }

  update(
    id: string,
    data: Partial<ScheduleEntity>,
  ): Promise<ScheduleEntity | null> {
    return this.sessionRepo.update(id, data);
  }

  toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null> {
    return this.sessionRepo.toggleAvailability(id, isAvailable);
  }

  delete(id: string): Promise<boolean> {
    return this.sessionRepo.delete(id);
  }

  // Calendar and Day Settings
  getCalendarSummary(
    staffId: string,
    month: string,
  ): Promise<CalendarSummaryResponse> {
    return this.dayRepo.getCalendarSummary(staffId, month);
  }

  // References
  getRooms(
    date?: string,
    startTime?: string,
    endTime?: string,
    excludePractitionerId?: string,
  ): Promise<ClinicRoomReferenceEntity[]> {
    return this.refRepo.getRooms(
      date,
      startTime,
      endTime,
      excludePractitionerId,
    );
  }

  getPolikliniks(): Promise<
    { id: string; code: string; name: string; location?: string | null }[]
  > {
    return this.refRepo.getPolikliniks();
  }

  getScheduleOptions(): Promise<ScheduleOptionsReferenceEntity> {
    return this.refRepo.getScheduleOptions();
  }

  getAdminDoctorScheduleFilterOptions(): Promise<any> {
    return this.refRepo.getAdminDoctorScheduleFilterOptions();
  }

  // Availability & Projections
  getScheduleContexts(
    staffId: string,
    date: string,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleContextEntity[]> {
    return this.availabilityRepo.getScheduleContexts(
      staffId,
      date,
      durationEditableByCurrentUser,
    );
  }

  projectAvailability(
    staffId: string,
    query: ScheduleProjectionQueryDto,
    durationEditableByCurrentUser: boolean,
  ): Promise<ScheduleProjectionEntity> {
    return this.availabilityRepo.projectAvailability(
      staffId,
      query,
      durationEditableByCurrentUser,
    );
  }


  // Occupancy
  getOccupancyOverview(
    staffId: string,
    query: ScheduleOccupancyQueryDto,
  ): Promise<ScheduleOccupancyOverviewData> {
    return this.occupancyRepo.getOccupancyOverview(staffId, query);
  }


  // Patients
  getBookedPatients(
    sessionId?: string,
    date?: string,
    staffId?: string,
  ): Promise<BookedPatientEntity[]> {
    return this.patientRepo.getBookedPatients(sessionId, date, staffId);
  }

  getAdminSessionPatients(
    practitionerId: string,
    sessionId: string,
    query: GetSessionPatientsQueryDto,
  ): Promise<AdminSessionPatientsResponse> {
    return this.patientRepo.getAdminSessionPatients(
      practitionerId,
      sessionId,
      query,
    );
  }

  getAdminDoctorPatientsByDate(
    practitionerId: string,
    date: string,
    query: GetAdminDoctorPatientsQueryDto,
  ): Promise<AdminDoctorAccumulatedPatientsResponse> {
    return this.patientRepo.getAdminDoctorPatientsByDate(
      practitionerId,
      date,
      query,
    );
  }

  // Clinical Practitioners
  findClinicalPractitioners(
    query: ClinicalPractitionersQueryDto,
  ): Promise<ClinicalPractitionerEntity[]> {
    return this.clinicalPractitionerRepo.findClinicalPractitioners(query);
  }

  // Admin Doctor Schedules
  findAdminDoctorSchedules(
    query: AdminDoctorSchedulesQueryDto,
  ): Promise<AdminDoctorScheduleListResponse> {
    return this.adminListQuery.execute(query);
  }

  findAdminDoctorScheduleDetail(
    id: string,
    query: AdminDoctorScheduleDetailQueryDto,
  ): Promise<AdminDoctorScheduleDetailResponse> {
    return this.adminDetailQuery.execute(id, query);
  }

  // Admin Mutations
  updateAdminDoctorSchedule(
    id: string,
    body: UpdateAdminDoctorScheduleDto,
  ): Promise<any> {
    return this.adminMutationRepo.updateAdminDoctorSchedule(id, body);
  }

  updateAdminDayStatus(
    id: string,
    date: string,
    status: string,
    notes?: string,
  ): Promise<any> {
    return this.adminMutationRepo.updateAdminDayStatus(id, date, status, notes);
  }

  createAdminDoctorSession(
    id: string,
    body: CreateAdminDoctorSessionDto,
  ): Promise<any> {
    return this.adminMutationRepo.createAdminDoctorSession(id, body);
  }

  deleteAdminDoctorSession(id: string, sessionId: string): Promise<any> {
    return this.adminMutationRepo.deleteAdminDoctorSession(id, sessionId);
  }

  updateAdminDoctorSession(
    id: string,
    sessionId: string,
    body: UpdateAdminDoctorSessionDto,
  ): Promise<any> {
    return this.adminMutationRepo.updateAdminDoctorSession(id, sessionId, body);
  }

  // Reschedule
  checkRescheduleEligibility(
    id: string,
    sessionId: string,
    query: CheckRescheduleEligibilityQueryDto,
  ): Promise<RescheduleEligibilityEntity> {
    return this.rescheduleRepo.checkRescheduleEligibility(id, sessionId, query);
  }

  rescheduleAdminDoctorSession(
    id: string,
    sessionId: string,
    body: RescheduleAdminDoctorSessionDto,
  ): Promise<any> {
    return this.rescheduleRepo.rescheduleAdminDoctorSession(
      id,
      sessionId,
      body,
    );
  }
}

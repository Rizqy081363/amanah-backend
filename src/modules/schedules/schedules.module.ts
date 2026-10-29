import { ClinicConfigModule } from '@common/clinic-config';
import { RedisModule } from '@common/redis/redis.module';
import { DoctorRosterModule } from '@modules/schedules/doctor-roster/doctor-roster.module';
import { SCHEDULE_REPOSITORY } from '@modules/schedules/domain/repositories/schedule.repository';
import { AppointmentOccupationQuery } from '@modules/schedules/infrastructure/drizzle/queries/appointment-occupation.query';
import { DoctorMySchedulesQuery } from '@modules/schedules/infrastructure/drizzle/queries/doctor-my-schedules.query';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import {
  DrizzleAdminDoctorScheduleDetailQuery,
  DrizzleAdminDoctorScheduleListQuery,
  DrizzleAdminScheduleConfigurationRepository,
  DrizzleAdminScheduleMutationRepository,
  DrizzleAdminSessionMutationRepository,
  DrizzleClinicalPractitionerRepository,
  DrizzleRescheduleEligibilityEvaluator,
  DrizzleScheduleAvailabilityRepository,
  DrizzleScheduleCapacityRepository,
  DrizzleScheduleConfigurationImpactEvaluator,
  DrizzleScheduleDayRepository,
  DrizzleSchedulePatientRepository,
  DrizzleScheduleReferenceRepository,
  DrizzleScheduleRescheduleRepository,
  DrizzleScheduleSessionRepository,
} from '@modules/schedules/infrastructure/drizzle/repositories';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { RoomResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/room.resolver';
import { ScheduleDrizzleRepository } from '@modules/schedules/infrastructure/drizzle/schedule.drizzle-repository';
import { OperatingDaysModule } from '@modules/schedules/operating-days/operating-days.module';
import { AdminDoctorSchedulesController } from '@modules/schedules/presentation/admin-doctor-schedules.controller';
import { AdminScheduleConfigurationController } from '@modules/schedules/presentation/admin-schedule-configuration.controller';
import { ClinicalPractitionersController } from '@modules/schedules/presentation/clinical-practitioners.controller';
import { SchedulesController } from '@modules/schedules/presentation/schedules.controller';
import { Module } from '@nestjs/common';
import { QueueEngineModule } from '../queue-engine/queue-engine.module';
import { StaffsModule } from '../staffs/staffs.module';
import {
  CreateScheduleUseCase,
  DeleteScheduleSessionUseCase,
  GetSchedulesUseCase,
  MutateDoctorSessionOperationalHoursUseCase,
  CreateOperationalShiftUseCase,
  UpdateOperationalShiftUseCase,
  UpdateScheduleUseCase,
} from './application/use-cases';

@Module({
  imports: [
    RedisModule,
    ClinicConfigModule,
    DoctorRosterModule,
    OperatingDaysModule,
    StaffsModule,
    QueueEngineModule,
  ],
  controllers: [
    SchedulesController,
    AdminDoctorSchedulesController,
    AdminScheduleConfigurationController,
    ClinicalPractitionersController,
  ],
  providers: [
    PractitionerResolver,
    RoomResolver,
    SchedulePolicyReader,
    ScheduleConflictQuery,
    DoctorMySchedulesQuery,
    AppointmentOccupationQuery,
    DrizzleRescheduleEligibilityEvaluator,
    DrizzleAdminSessionMutationRepository,
    DrizzleScheduleSessionRepository,
    DrizzleScheduleDayRepository,
    DrizzleScheduleReferenceRepository,
    DrizzleScheduleAvailabilityRepository,
    DrizzleScheduleCapacityRepository,
    DrizzleScheduleRescheduleRepository,
    DrizzleSchedulePatientRepository,
    DrizzleClinicalPractitionerRepository,
    DrizzleAdminDoctorScheduleListQuery,
    DrizzleAdminDoctorScheduleDetailQuery,
    DrizzleAdminScheduleMutationRepository,
    DrizzleAdminScheduleConfigurationRepository,
    DrizzleScheduleConfigurationImpactEvaluator,
    CreateScheduleUseCase,
    CreateOperationalShiftUseCase,
    GetSchedulesUseCase,
    UpdateScheduleUseCase,
    DeleteScheduleSessionUseCase,
    UpdateOperationalShiftUseCase,
    MutateDoctorSessionOperationalHoursUseCase,
    {
      provide: SCHEDULE_REPOSITORY,
      useClass: ScheduleDrizzleRepository,
    },
  ],
  exports: [
    SCHEDULE_REPOSITORY,
    CreateScheduleUseCase,
    CreateOperationalShiftUseCase,
    GetSchedulesUseCase,
    UpdateScheduleUseCase,
    DeleteScheduleSessionUseCase,
    UpdateOperationalShiftUseCase,
    MutateDoctorSessionOperationalHoursUseCase,
    PractitionerResolver,
    RoomResolver,
    ScheduleConflictQuery,
    DoctorMySchedulesQuery,
    AppointmentOccupationQuery,
    SchedulePolicyReader,
    DrizzleScheduleSessionRepository,
    DrizzleScheduleDayRepository,
    DrizzleScheduleReferenceRepository,
    DrizzleScheduleAvailabilityRepository,
    DrizzleScheduleCapacityRepository,
    DrizzleScheduleRescheduleRepository,
    DrizzleSchedulePatientRepository,
    DrizzleClinicalPractitionerRepository,
    DrizzleAdminDoctorScheduleListQuery,
    DrizzleAdminDoctorScheduleDetailQuery,
    DrizzleAdminScheduleMutationRepository,
    DrizzleAdminSessionMutationRepository,
    DrizzleAdminScheduleConfigurationRepository,
    DrizzleScheduleConfigurationImpactEvaluator,
    DrizzleRescheduleEligibilityEvaluator,
    DoctorRosterModule,
    OperatingDaysModule,
  ],
})
export class SchedulesModule {}

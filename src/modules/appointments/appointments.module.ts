import { forwardRef, Module } from '@nestjs/common';
import { ClinicConfigModule } from '../../common/clinic-config/clinic-config.module';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { SchedulePolicyReader } from '../schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { CandidateAssignmentModule } from './candidate-assignment/candidate-assignment.module';
import { AppointmentCallLifecycleService } from './application/appointment-call-lifecycle.service';
import { AppointmentNotificationPublisher } from './application/appointment-notification.publisher';
import { AppointmentsService } from './application/appointments.service';
import { PatientAppointmentHistoryService } from './application/patient-appointment-history.service';
import { APPOINTMENT_CHECK_IN_REPOSITORY_PORT } from './application/ports/appointment-check-in.repository.port';
import { APPOINTMENT_REPOSITORY_PORT } from './application/ports/appointment-repository.port';
import { PUSH_NOTIFICATION_PORT } from './application/ports/push-notification.port';
import { REALTIME_EMITTER_PORT } from './application/ports/realtime-emitter.port';
import { AppointmentCandidateResolver } from './application/resolvers/appointment-candidate.resolver';
import { AppointmentAssignmentService } from './application/services/appointment-assignment.service';
import { BookAppointmentUseCase } from './application/use-cases/book-appointment.use-case';
import { CallPatientUseCase } from './application/use-cases/call-patient.use-case';
import { CancelAppointmentUseCase } from './application/use-cases/cancel-appointment.use-case';
import { CompleteServiceUseCase } from './application/use-cases/complete-service.use-case';
import { GenerateCheckInQrUseCase } from './application/use-cases/generate-check-in-qr.use-case';
import { GetAppointmentListUseCase } from './application/use-cases/get-appointment-list.use-case';
import { PerformCheckInUseCase } from './application/use-cases/perform-check-in.use-case';
import { StartServiceUseCase } from './application/use-cases/start-service.use-case';
import { SweepLateAppointmentsUseCase } from './application/use-cases/sweep-late-appointments.use-case';
import { AppointmentsNotificationRules } from './appointments.notifications';
import { APPOINTMENT_CALL_REPOSITORY } from './domain/constants/appointment-lifecycle.constants';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';
import { ActiveTicketPolicyService } from './domain/services/active-ticket-policy.service';
import { AppointmentPolicyReader } from './domain/services/appointment-policy.reader';
import { AppointmentPoliklinikResolver } from './domain/services/appointment-poliklinik.resolver';
import { AppointmentPushAdapter } from './infrastructure/adapters/appointment-push.adapter';
import { AppointmentRealtimeAdapter } from './infrastructure/adapters/appointment-realtime.adapter';
import { AppointmentDrizzleRepository } from './infrastructure/drizzle/appointment.drizzle-repository';
import { AppointmentCallDrizzleRepository } from './infrastructure/drizzle/appointment-call.drizzle-repository';
import { AppointmentCheckInDrizzleRepository } from './infrastructure/drizzle/appointment-check-in.drizzle-repository';
import { AppointmentHardenedDrizzleRepository } from './infrastructure/drizzle/appointment-hardened.drizzle-repository';
import { AppointmentEventsListener } from './infrastructure/listeners/appointment-events.listener';
import { AppointmentRecipientResolver } from './infrastructure/resolvers/appointment-recipient.resolver';
import { AdminAppointmentsController } from './presentation/admin-appointments.controller';
import { AppointmentCallController } from './presentation/appointment-call.controller';
import { AppointmentOperationsController } from './presentation/appointment-operations.controller';
import { AppointmentsController } from './presentation/appointments.controller';
import { AppointmentDomainExceptionFilter } from './presentation/filters/appointment-domain-exception.filter';
import { PatientAppointmentHistoryController } from './presentation/patient-appointment-history.controller';

@Module({
  imports: [
    DrizzleModule,
    ClinicConfigModule,
    forwardRef(() => CandidateAssignmentModule),
  ],
  controllers: [
    AppointmentsController,
    AdminAppointmentsController,
    AppointmentCallController,
    AppointmentOperationsController,
    PatientAppointmentHistoryController,
  ],
  providers: [
    SchedulePolicyReader,
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: AppointmentDrizzleRepository,
    },
    {
      provide: APPOINTMENT_REPOSITORY_PORT,
      useClass: AppointmentHardenedDrizzleRepository,
    },
    {
      provide: REALTIME_EMITTER_PORT,
      useClass: AppointmentRealtimeAdapter,
    },
    {
      provide: PUSH_NOTIFICATION_PORT,
      useClass: AppointmentPushAdapter,
    },
    {
      provide: APPOINTMENT_CALL_REPOSITORY,
      useClass: AppointmentCallDrizzleRepository,
    },
    {
      provide: APPOINTMENT_CHECK_IN_REPOSITORY_PORT,
      useClass: AppointmentCheckInDrizzleRepository,
    },
    {
      provide: 'FIND_APPOINTMENT_BY_ID',
      useFactory: (appointmentsService: AppointmentsService) => (id: string) =>
        appointmentsService.findById(id),
      inject: [AppointmentsService],
    },
    AppointmentPolicyReader,
    AppointmentsService,
    AppointmentCandidateResolver,
    AppointmentAssignmentService,
    AppointmentEventsListener,
    AppointmentCallDrizzleRepository,
    AppointmentCheckInDrizzleRepository,
    AppointmentCallLifecycleService,
    AppointmentNotificationPublisher,
    AppointmentsNotificationRules,
    AppointmentRecipientResolver,
    PatientAppointmentHistoryService,
    AppointmentHardenedDrizzleRepository,
    AppointmentRealtimeAdapter,
    AppointmentPushAdapter,
    AppointmentDomainExceptionFilter,
    CallPatientUseCase,
    StartServiceUseCase,
    CompleteServiceUseCase,
    CancelAppointmentUseCase,
    SweepLateAppointmentsUseCase,
    BookAppointmentUseCase,
    GetAppointmentListUseCase,
    GenerateCheckInQrUseCase,
    PerformCheckInUseCase,
    AppointmentPoliklinikResolver,
    ActiveTicketPolicyService,
  ],
  exports: [
    APPOINTMENT_REPOSITORY,
    APPOINTMENT_REPOSITORY_PORT,
    APPOINTMENT_CHECK_IN_REPOSITORY_PORT,
    ActiveTicketPolicyService,
    AppointmentPolicyReader,
    AppointmentPoliklinikResolver,
    AppointmentsService,
    AppointmentCandidateResolver,
    AppointmentAssignmentService,
    AppointmentNotificationPublisher,
    AppointmentCallLifecycleService,
    PatientAppointmentHistoryService,
    CallPatientUseCase,
    StartServiceUseCase,
    CompleteServiceUseCase,
    CancelAppointmentUseCase,
    SweepLateAppointmentsUseCase,
    BookAppointmentUseCase,
    GetAppointmentListUseCase,
    GenerateCheckInQrUseCase,
    PerformCheckInUseCase,
    'FIND_APPOINTMENT_BY_ID',
    CandidateAssignmentModule,
  ],
})
export class AppointmentsModule {}

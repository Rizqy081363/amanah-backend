import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppointmentCallLifecycleService } from './application/appointment-call-lifecycle.service';
import { AppointmentsService } from './application/appointments.service';
import { PatientAppointmentHistoryService } from './application/patient-appointment-history.service';
import { AppointmentsNotificationRules } from './appointments.notifications';
import { APPOINTMENT_CALL_REPOSITORY } from './domain/constants/appointment-lifecycle.constants';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';
import { AppointmentDrizzleRepository } from './infrastructure/drizzle/appointment.drizzle-repository';
import { AppointmentCallDrizzleRepository } from './infrastructure/drizzle/appointment-call.drizzle-repository';
import { AppointmentEventsListener } from './infrastructure/listeners/appointment-events.listener';
import { AdminAppointmentsController } from './presentation/admin-appointments.controller';
import { AppointmentCallController } from './presentation/appointment-call.controller';
import { AppointmentsController } from './presentation/appointments.controller';
import { PatientAppointmentHistoryController } from './presentation/patient-appointment-history.controller';

@Module({
  imports: [DrizzleModule, NotificationsModule],
  controllers: [
    AppointmentsController,
    AdminAppointmentsController,
    AppointmentCallController,
    PatientAppointmentHistoryController,
  ],
  providers: [
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: AppointmentDrizzleRepository,
    },
    {
      provide: APPOINTMENT_CALL_REPOSITORY,
      useClass: AppointmentCallDrizzleRepository,
    },
    AppointmentsService,
    AppointmentEventsListener,
    AppointmentCallDrizzleRepository,
    AppointmentCallLifecycleService,
    AppointmentsNotificationRules,
    PatientAppointmentHistoryService,
  ],
  exports: [
    APPOINTMENT_REPOSITORY,
    AppointmentsService,
    AppointmentCallLifecycleService,
    PatientAppointmentHistoryService,
  ],
})
export class AppointmentsModule {}

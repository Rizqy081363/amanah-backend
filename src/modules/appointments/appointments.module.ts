import { Module } from '@nestjs/common';
import { AppointmentsService } from './application/appointments.service';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';
import { AppointmentDrizzleRepository } from './infrastructure/drizzle/appointment.drizzle-repository';
import { AppointmentEventsListener } from './infrastructure/listeners/appointment-events.listener';
import { AppointmentsController } from './presentation/appointments.controller';

@Module({
  controllers: [AppointmentsController],
  providers: [
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: AppointmentDrizzleRepository,
    },
    AppointmentsService,
    AppointmentEventsListener,
  ],
  exports: [APPOINTMENT_REPOSITORY, AppointmentsService],
})
export class AppointmentsModule {}

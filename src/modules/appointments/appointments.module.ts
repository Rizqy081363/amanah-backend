import { Module } from '@nestjs/common';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';
import { AppointmentDrizzleRepository } from './infrastructure/drizzle/appointment.drizzle-repository';
import { AppointmentsController } from './presentation/appointments.controller';

@Module({
  controllers: [AppointmentsController],
  providers: [
    {
      provide: APPOINTMENT_REPOSITORY,
      useClass: AppointmentDrizzleRepository,
    },
  ],
  exports: [APPOINTMENT_REPOSITORY],
})
export class AppointmentsModule {}

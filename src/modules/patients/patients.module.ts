import { Module } from '@nestjs/common';
import { PATIENT_REPOSITORY } from './domain/repositories/patient.repository';
import { PatientDrizzleRepository } from './infrastructure/drizzle/patient.drizzle-repository';
import { PatientsController } from './presentation/patients.controller';

@Module({
  controllers: [PatientsController],
  providers: [
    {
      provide: PATIENT_REPOSITORY,
      useClass: PatientDrizzleRepository,
    },
  ],
  exports: [PATIENT_REPOSITORY],
})
export class PatientsModule {}

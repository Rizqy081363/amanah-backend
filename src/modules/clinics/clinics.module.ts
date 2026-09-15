import { Module } from '@nestjs/common';
import { CLINIC_REPOSITORY } from './domain/repositories/clinic.repository';
import { ClinicDrizzleRepository } from './infrastructure/drizzle/clinic.drizzle-repository';
import { ClinicsController } from './presentation/clinics.controller';

@Module({
  controllers: [ClinicsController],
  providers: [
    {
      provide: CLINIC_REPOSITORY,
      useClass: ClinicDrizzleRepository,
    },
  ],
  exports: [CLINIC_REPOSITORY],
})
export class ClinicsModule {}

import { Module } from '@nestjs/common';
import { CLINIC_REPOSITORY } from './domain/repositories/clinic.repository';
import { ClinicDrizzleRepository } from './infrastructure/drizzle/clinic.drizzle-repository';
import { ClinicAnalyticsController } from './presentation/clinic-analytics.controller';
import { ClinicsController } from './presentation/clinics.controller';

@Module({
  controllers: [ClinicsController, ClinicAnalyticsController],
  providers: [
    {
      provide: CLINIC_REPOSITORY,
      useClass: ClinicDrizzleRepository,
    },
  ],
  exports: [CLINIC_REPOSITORY],
})
export class ClinicsModule {}

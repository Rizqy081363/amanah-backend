import { Module } from '@nestjs/common';
import { ClinicsService } from './application/clinics.service';
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
    ClinicsService,
  ],
  exports: [CLINIC_REPOSITORY, ClinicsService],
})
export class ClinicsModule {}

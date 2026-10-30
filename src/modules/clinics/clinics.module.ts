import { Module } from '@nestjs/common';
import { AdminFacilitiesService } from './application/admin-facilities.service';
import { ClinicsService } from './application/clinics.service';
import { CLINIC_REPOSITORY } from './domain/repositories/clinic.repository';
import { ClinicDrizzleRepository } from './infrastructure/drizzle/clinic.drizzle-repository';
import { AdminFacilitiesController } from './presentation/admin-facilities.controller';
import { ClinicAnalyticsController } from './presentation/clinic-analytics.controller';
import { ClinicsController } from './presentation/clinics.controller';

@Module({
  controllers: [
    ClinicsController,
    ClinicAnalyticsController,
    AdminFacilitiesController,
  ],
  providers: [
    {
      provide: CLINIC_REPOSITORY,
      useClass: ClinicDrizzleRepository,
    },
    ClinicsService,
    AdminFacilitiesService,
  ],
  exports: [CLINIC_REPOSITORY, ClinicsService, AdminFacilitiesService],
})
export class ClinicsModule {}

import { Module } from '@nestjs/common';
import { AdminFacilitiesService } from './application/admin-facilities.service';
import { ClinicFacilitiesService } from './application/clinic-facilities.service';
import { ClinicsService } from './application/clinics.service';
import { SupportFaqsService } from './application/support-faqs.service';
import { CLINIC_REPOSITORY } from './domain/repositories/clinic.repository';
import { ClinicDrizzleRepository } from './infrastructure/drizzle/clinic.drizzle-repository';
import { AdminClinicContentController } from './presentation/admin-clinic-content.controller';
import { AdminFacilitiesController } from './presentation/admin-facilities.controller';
import { ClinicAnalyticsController } from './presentation/clinic-analytics.controller';
import { ClinicsController } from './presentation/clinics.controller';

@Module({
  controllers: [
    ClinicsController,
    ClinicAnalyticsController,
    AdminFacilitiesController,
    AdminClinicContentController,
  ],
  providers: [
    {
      provide: CLINIC_REPOSITORY,
      useClass: ClinicDrizzleRepository,
    },
    ClinicsService,
    ClinicFacilitiesService,
    SupportFaqsService,
    AdminFacilitiesService,
  ],
  exports: [
    CLINIC_REPOSITORY,
    ClinicsService,
    ClinicFacilitiesService,
    SupportFaqsService,
    AdminFacilitiesService,
  ],
})
export class ClinicsModule {}

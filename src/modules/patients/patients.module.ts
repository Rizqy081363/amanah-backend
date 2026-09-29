import { Module } from '@nestjs/common';
import { PATIENT_REPOSITORY } from './domain/repositories/patient.repository';
import { PATIENT_AFFILIATION_REPOSITORY } from './domain/repositories/patient-affiliation.repository';
import { PatientDrizzleRepository } from './infrastructure/drizzle/patient.drizzle-repository';
import { PatientAffiliationDrizzleRepository } from './infrastructure/drizzle/patient-affiliation.drizzle-repository';
import { OccupationsController } from './presentation/occupations.controller';
import { PatientAffiliationsController } from './presentation/patient-affiliations.controller';
import { PatientsController } from './presentation/patients.controller';
import { PatientReferencesController } from './presentation/patient-references.controller';
import { IndonesianRegionService } from './infrastructure/services/indonesian-region.service';

@Module({
  controllers: [
    PatientsController,
    PatientAffiliationsController,
    OccupationsController,
    PatientReferencesController,
  ],
  providers: [
    IndonesianRegionService,
    {
      provide: PATIENT_REPOSITORY,
      useClass: PatientDrizzleRepository,
    },
    {
      provide: PATIENT_AFFILIATION_REPOSITORY,
      useClass: PatientAffiliationDrizzleRepository,
    },
  ],
  exports: [
    PATIENT_REPOSITORY,
    PATIENT_AFFILIATION_REPOSITORY,
    IndonesianRegionService,
  ],
})
export class PatientsModule {}

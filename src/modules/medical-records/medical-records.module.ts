import { forwardRef, Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { FormRequirementService } from './application/form-requirement.service';
import { ImmunizationCatalogService } from './application/services/immunization-catalog.service';
import { MaternalCatalogService } from './application/services/maternal-catalog.service';
import { MEDICAL_RECORD_REPOSITORY } from './domain/repositories/medical-record.repository';
import { ObstetricCalculatorService } from './domain/services/obstetric-calculator.service';
import { KiaIntakeDrizzleRepository } from './infrastructure/drizzle/kia-intake.drizzle-repository';
import { MaternalIntakeDrizzleRepository } from './infrastructure/drizzle/maternal-intake.drizzle-repository';
import { MedicalRecordDrizzleRepository } from './infrastructure/drizzle/medical-record.drizzle-repository';
import { ImmunizationCatalogController } from './presentation/immunization-catalog.controller';
import { MaternalCatalogController } from './presentation/maternal-catalog.controller';
import { MedicalIntakesController } from './presentation/medical-intakes.controller';
import { MedicalRecordsController } from './presentation/medical-records.controller';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [PatientsModule, forwardRef(() => AppointmentsModule)],
  controllers: [
    MedicalRecordsController,
    MedicalIntakesController,
    MaternalCatalogController,
    ImmunizationCatalogController,
  ],
  providers: [
    ObstetricCalculatorService,
    MaternalCatalogService,
    ImmunizationCatalogService,
    FormRequirementService,
    MaternalIntakeDrizzleRepository,
    KiaIntakeDrizzleRepository,
    {
      provide: MEDICAL_RECORD_REPOSITORY,
      useClass: MedicalRecordDrizzleRepository,
    },
  ],
  exports: [
    MEDICAL_RECORD_REPOSITORY,
    KiaIntakeDrizzleRepository,
    MaternalIntakeDrizzleRepository,
    MaternalCatalogService,
    ImmunizationCatalogService,
    ObstetricCalculatorService,
    FormRequirementService,
  ],
})
export class MedicalRecordsModule {}

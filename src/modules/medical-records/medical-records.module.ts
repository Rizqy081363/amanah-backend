import { forwardRef, Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { ImmunizationModule } from '../immunization/immunization.module';
import { MaternityModule } from '../maternity/maternity.module';
import { FormRequirementService } from './application/form-requirement.service';
import { MEDICAL_RECORD_REPOSITORY } from './domain/repositories/medical-record.repository';
import { ObstetricCalculatorService } from './domain/services/obstetric-calculator.service';
import { KiaIntakeDrizzleRepository } from './infrastructure/drizzle/kia-intake.drizzle-repository';
import { MedicalRecordDrizzleRepository } from './infrastructure/drizzle/medical-record.drizzle-repository';
import { MedicalIntakesController } from './presentation/medical-intakes.controller';
import { MedicalRecordsController } from './presentation/medical-records.controller';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [
    PatientsModule,
    ImmunizationModule,
    MaternityModule,
    forwardRef(() => AppointmentsModule),
  ],
  controllers: [
    MedicalRecordsController,
    MedicalIntakesController,
  ],
  providers: [
    ObstetricCalculatorService,
    FormRequirementService,
    KiaIntakeDrizzleRepository,
    {
      provide: MEDICAL_RECORD_REPOSITORY,
      useClass: MedicalRecordDrizzleRepository,
    },
  ],
  exports: [
    MEDICAL_RECORD_REPOSITORY,
    KiaIntakeDrizzleRepository,
    ObstetricCalculatorService,
    FormRequirementService,
  ],
})
export class MedicalRecordsModule {}

import { Module } from '@nestjs/common';
import { MEDICAL_RECORD_REPOSITORY } from './domain/repositories/medical-record.repository';
import { ObstetricCalculatorService } from './domain/services/obstetric-calculator.service';
import { KiaIntakeDrizzleRepository } from './infrastructure/drizzle/kia-intake.drizzle-repository';
import { MedicalRecordDrizzleRepository } from './infrastructure/drizzle/medical-record.drizzle-repository';
import { MedicalRecordsController } from './presentation/medical-records.controller';

@Module({
  controllers: [MedicalRecordsController],
  providers: [
    ObstetricCalculatorService,
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
  ],
})
export class MedicalRecordsModule {}

import { Module } from '@nestjs/common';
import { MaternalCatalogService } from './application/services/maternal-catalog.service';
import { MEDICAL_RECORD_REPOSITORY } from './domain/repositories/medical-record.repository';
import { ObstetricCalculatorService } from './domain/services/obstetric-calculator.service';
import { KiaIntakeDrizzleRepository } from './infrastructure/drizzle/kia-intake.drizzle-repository';
import { MaternalIntakeDrizzleRepository } from './infrastructure/drizzle/maternal-intake.drizzle-repository';
import { MedicalRecordDrizzleRepository } from './infrastructure/drizzle/medical-record.drizzle-repository';
import { MaternalCatalogController } from './presentation/maternal-catalog.controller';
import { MedicalRecordsController } from './presentation/medical-records.controller';

@Module({
  controllers: [MedicalRecordsController, MaternalCatalogController],
  providers: [
    ObstetricCalculatorService,
    MaternalCatalogService,
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
    ObstetricCalculatorService,
  ],
})
export class MedicalRecordsModule {}

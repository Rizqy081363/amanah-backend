import { Module } from '@nestjs/common';
import { MEDICAL_RECORD_REPOSITORY } from './domain/repositories/medical-record.repository';
import { MedicalRecordDrizzleRepository } from './infrastructure/drizzle/medical-record.drizzle-repository';
import { MedicalRecordsController } from './presentation/medical-records.controller';

@Module({
  controllers: [MedicalRecordsController],
  providers: [
    {
      provide: MEDICAL_RECORD_REPOSITORY,
      useClass: MedicalRecordDrizzleRepository,
    },
  ],
  exports: [MEDICAL_RECORD_REPOSITORY],
})
export class MedicalRecordsModule {}

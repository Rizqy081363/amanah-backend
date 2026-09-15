import { Module } from '@nestjs/common';
import { STAFF_REPOSITORY } from './domain/repositories/staff.repository';
import { StaffDrizzleRepository } from './infrastructure/drizzle/staff.drizzle-repository';
import { StaffsController } from './presentation/staffs.controller';

@Module({
  controllers: [StaffsController],
  providers: [
    {
      provide: STAFF_REPOSITORY,
      useClass: StaffDrizzleRepository,
    },
  ],
  exports: [STAFF_REPOSITORY],
})
export class StaffsModule {}

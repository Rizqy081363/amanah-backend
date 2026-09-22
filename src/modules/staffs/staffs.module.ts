import { Module } from '@nestjs/common';
import { AvatarModule } from '../avatar/avatar.module';
import { STAFF_REPOSITORY } from './domain/repositories/staff.repository';
import { StaffDrizzleRepository } from './infrastructure/drizzle/staff.drizzle-repository';
import { StaffsController } from './presentation/staffs.controller';

@Module({
  imports: [AvatarModule],
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

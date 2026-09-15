import { Module } from '@nestjs/common';
import { ATTENDANCE_REPOSITORY } from './domain/repositories/attendance.repository';
import { AttendanceDrizzleRepository } from './infrastructure/drizzle/attendance.drizzle-repository';
import { AttendanceController } from './presentation/attendance.controller';

@Module({
  controllers: [AttendanceController],
  providers: [
    {
      provide: ATTENDANCE_REPOSITORY,
      useClass: AttendanceDrizzleRepository,
    },
  ],
  exports: [ATTENDANCE_REPOSITORY],
})
export class AttendanceModule {}

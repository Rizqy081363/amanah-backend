import { RedisModule } from '@common/redis/redis.module';
import { DrizzleModule } from '@database/drizzle/drizzle.module';
import { Module } from '@nestjs/common';
import { DOCTOR_ROSTER_REPOSITORY } from './domain/doctor-roster.repository';
import { DrizzleDoctorRosterRepository } from './infrastructure/drizzle-doctor-roster.repository';
import { AdminDoctorRosterController } from './presentation/admin-doctor-roster.controller';

@Module({
  imports: [DrizzleModule, RedisModule],
  controllers: [AdminDoctorRosterController],
  providers: [
    {
      provide: DOCTOR_ROSTER_REPOSITORY,
      useClass: DrizzleDoctorRosterRepository,
    },
  ],
  exports: [DOCTOR_ROSTER_REPOSITORY],
})
export class DoctorRosterModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// Feature modules
import { AuthModule } from './auth/auth.module';
import authConfig from './auth/config/auth.config';
import cacheConfig from './cache/cache.config';
import { RedisModule } from './common/redis/redis.module';
import appConfig from './config/app.config';
import databaseConfig from './database/config/database.config';
import { DrizzleModule } from './database/drizzle/drizzle.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import mailConfig from './mail/config/mail.config';
import { MailModule } from './mail/mail.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { PatientsModule } from './modules/patients/patients.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { StaffsModule } from './modules/staffs/staffs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig, cacheConfig, authConfig, mailConfig],
      envFilePath: ['.env', 'env-example-relational'],
    }),
    DrizzleModule,
    RedisModule,
    HealthModule,
    HomeModule,
    MailModule,
    AuthModule,
    ClinicsModule,
    PatientsModule,
    StaffsModule,
    SchedulesModule,
    AppointmentsModule,
    MedicalRecordsModule,
    AttendanceModule,
    LeavesModule,
  ],
})
export class AppModule {}

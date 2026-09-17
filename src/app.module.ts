import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
// Feature modules
import { AuthModule } from './auth/auth.module';
import authConfig from './auth/config/auth.config';
import cacheConfig from './cache/cache.config';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { OutboxModule } from './common/outbox/outbox.module';
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
import { AuditModule } from './modules/audit/audit.module';
import { ClinicsModule } from './modules/clinics/clinics.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PatientsModule } from './modules/patients/patients.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { StaffsModule } from './modules/staffs/staffs.module';
import { SupportTicketsModule } from './modules/support-tickets/support-tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig, cacheConfig, authConfig, mailConfig],
      envFilePath: ['.env', 'env-example-relational'],
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      verboseMemoryLeak: true,
    }),
    DrizzleModule,
    RedisModule,
    OutboxModule,
    HealthModule,
    HomeModule,
    MailModule,
    AuthModule,
    AuditModule,
    ClinicsModule,
    PatientsModule,
    StaffsModule,
    SchedulesModule,
    AppointmentsModule,
    MedicalRecordsModule,
    AttendanceModule,
    LeavesModule,
    NotificationsModule,
    SupportTicketsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

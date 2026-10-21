import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClinicConfigModule } from '../clinic-config/clinic-config.module';
import { RedisModule } from '../redis/redis.module';
import { CronSchedulerAdapter } from './cron-scheduler.adapter';
import { SCHEDULER_PORT } from './scheduler.constants';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ClinicConfigModule,
    RedisModule,
  ],
  providers: [
    CronSchedulerAdapter,
    {
      provide: SCHEDULER_PORT,
      useExisting: CronSchedulerAdapter,
    },
  ],
  exports: [CronSchedulerAdapter, SCHEDULER_PORT],
})
export class SchedulerModule {}

import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClinicConfigModule } from '../clinic-config/clinic-config.module';
import { RedisModule } from '../redis/redis.module';
import { CronSchedulerAdapter } from './cron-scheduler.adapter';
import { SCHEDULER_PORT } from './scheduler.constants';
import { AdminSchedulerController } from './presentation/admin-scheduler.controller';

@Global()
@Module({
  imports: [ScheduleModule.forRoot(), ClinicConfigModule, RedisModule],
  controllers: [AdminSchedulerController],
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

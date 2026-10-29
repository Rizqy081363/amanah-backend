import { Module } from '@nestjs/common';
import { ClinicConfigModule } from '../../common/clinic-config/clinic-config.module';
import { SchedulerModule } from '../../common/scheduler/scheduler.module';
import { ReplacementCleanupScheduler } from './application/scheduler/replacement-cleanup.scheduler';
import { REPLACEMENT_REPOSITORY } from './domain/repositories/replacement.repository';
import { ReplacementDrizzleRepository } from './infrastructure/drizzle/replacement.drizzle-repository';
import { ReplacementsController } from './presentation/replacements.controller';

@Module({
  imports: [ClinicConfigModule, SchedulerModule],
  controllers: [ReplacementsController],
  providers: [
    {
      provide: REPLACEMENT_REPOSITORY,
      useClass: ReplacementDrizzleRepository,
    },
    ReplacementCleanupScheduler,
  ],
  exports: [REPLACEMENT_REPOSITORY],
})
export class ReplacementsModule {}

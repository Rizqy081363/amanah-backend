import { Module } from '@nestjs/common';
import { ClinicConfigModule } from '../../common/clinic-config/clinic-config.module';
import { CalendarService } from './domain/services/calendar.service';
import { ClinicSettingService } from './infrastructure/config/clinic-setting.service';
import { ClosureEngineService } from './domain/services/closure-engine.service';
import { EstimatorService } from './domain/services/estimator.service';
import { QueueEngineService } from './domain/services/queue-engine.service';
import { SimulatorService } from './domain/services/simulator.service';
import { DrizzleQueueEngineRepository } from './infrastructure/drizzle/drizzle-queue-engine.repository';

import { V2CatalogController } from './presentation/controllers/v2-catalog.controller';
import { V2TicketsController } from './presentation/controllers/v2-tickets.controller';
import { V2AdminQueueController } from './presentation/controllers/v2-admin-queue.controller';

export const QUEUE_ENGINE_REPOSITORY = 'QUEUE_ENGINE_REPOSITORY';

@Module({
  imports: [ClinicConfigModule],
  controllers: [
    V2CatalogController,
    V2TicketsController,
    V2AdminQueueController,
  ],
  providers: [
    CalendarService,
    EstimatorService,
    SimulatorService,
    QueueEngineService,
    {
      provide: ClosureEngineService,
      useFactory: (calendar: CalendarService, settings: ClinicSettingService) =>
        new ClosureEngineService(calendar, settings),
      inject: [CalendarService, ClinicSettingService],
    },
    ClinicSettingService,
    DrizzleQueueEngineRepository,
    {
      provide: QUEUE_ENGINE_REPOSITORY,
      useExisting: DrizzleQueueEngineRepository,
    },
  ],
  exports: [
    CalendarService,
    EstimatorService,
    SimulatorService,
    QueueEngineService,
    ClosureEngineService,
    ClinicSettingService,
    DrizzleQueueEngineRepository,
    QUEUE_ENGINE_REPOSITORY,
  ],
})
export class QueueEngineModule {}

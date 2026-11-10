import { Module } from '@nestjs/common';
import { SchedulerModule } from '../../common/scheduler';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PromotionsBroadcastService } from './application/services/promotions-broadcast.service';
import { PromotionsScheduler } from './application/scheduler/promotions.scheduler';
import { PromotionsService } from './application/promotions.service';
import { PROMOTION_REPOSITORY } from './domain/repositories/promotion.repository.interface';
import { PromotionDrizzleRepository } from './infrastructure/drizzle/promotion.drizzle-repository';
import { AdminPromotionsController } from './presentation/admin-promotions.controller';
import { PublicPromotionsController } from './presentation/public-promotions.controller';

@Module({
  imports: [DrizzleModule, SchedulerModule, NotificationsModule],
  controllers: [PublicPromotionsController, AdminPromotionsController],
  providers: [
    {
      provide: PROMOTION_REPOSITORY,
      useClass: PromotionDrizzleRepository,
    },
    PromotionsService,
    PromotionsBroadcastService,
    PromotionsScheduler,
  ],
  exports: [PROMOTION_REPOSITORY, PromotionsService],
})
export class PromotionsModule {}

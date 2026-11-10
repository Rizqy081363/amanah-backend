import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ISchedulerPort, SCHEDULER_PORT } from '../../../../common/scheduler';
import { PromotionsBroadcastService } from '../services/promotions-broadcast.service';

@Injectable()
export class PromotionsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PromotionsScheduler.name);

  constructor(
    @Inject(SCHEDULER_PORT)
    private readonly scheduler: ISchedulerPort,
    private readonly broadcastService: PromotionsBroadcastService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log(
        'Registering dynamic promo scheduled broadcast job with ISchedulerPort...',
      );

      await this.scheduler.registerDynamicJob({
        jobId: 'promo_scheduled_broadcast',
        description:
          'Pemeriksaan dan broadcast promo terjadwal yang telah masuk periode live ke pengguna eksternal',
        cronExpression: '*/5 * * * *',
        distributedLock: true,
        handler: async () => {
          await this.broadcastService.processScheduledBroadcasts();
        },
      });

      this.logger.log('Promo broadcast dynamic job registered successfully.');
    } catch (err) {
      this.logger.error(
        `Failed to register promo broadcast dynamic job: ${String(err)}`,
      );
    }
  }
}

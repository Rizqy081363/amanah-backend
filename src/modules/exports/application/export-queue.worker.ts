import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EXPORTS_WORK_QUEUE } from '../../../common/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '../../../common/rabbitmq/rabbitmq.service';
import { ExportRunnerService } from './export-runner.service';

@Injectable()
export class ExportQueueWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportQueueWorker.name);
  private isConsuming = false;

  constructor(
    private readonly rabbitmqService: RabbitMQService,
    private readonly exportRunner: ExportRunnerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    this.isConsuming = false;
  }

  private async startConsumer(): Promise<void> {
    const channel = this.rabbitmqService.getChannel();
    if (!channel) {
      this.logger.warn(
        'RabbitMQ channel not ready; retrying export consumer in 3 seconds',
      );
      setTimeout(() => void this.startConsumer(), 3000);
      return;
    }

    try {
      await channel.prefetch(1);
      this.isConsuming = true;

      await channel.consume(
        EXPORTS_WORK_QUEUE,
        async (msg) => {
          if (!msg || !this.isConsuming) return;

          try {
            const content = JSON.parse(msg.content.toString('utf-8'));
            const jobId = content.jobId;

            if (jobId) {
              this.logger.log(`Processing background export job: ${jobId}`);
              await this.exportRunner.execute(jobId);
            }

            channel.ack(msg);
          } catch (error: any) {
            this.logger.error(
              `Error processing export message: ${error.message}`,
              error.stack,
            );
            // Ack to prevent poison message loop, as status is already marked failed in DB
            channel.ack(msg);
          }
        },
        { noAck: false },
      );

      this.logger.log(`ExportQueueWorker listening on ${EXPORTS_WORK_QUEUE}`);
    } catch (err: any) {
      this.logger.error(`Failed to start ExportQueueWorker: ${err.message}`);
      setTimeout(() => void this.startConsumer(), 5000);
    }
  }
}

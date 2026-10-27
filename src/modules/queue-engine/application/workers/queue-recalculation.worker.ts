import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_RECALCULATION_QUEUE } from '../../../../common/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '../../../../common/rabbitmq/rabbitmq.service';
import {
  QueueRecalculationService,
  type RecalculationParams,
} from '../services/queue-recalculation.service';

@Injectable()
export class QueueRecalculationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueRecalculationWorker.name);
  private isConsuming = false;
  private retryTimeout?: NodeJS.Timeout;

  constructor(
    private readonly rabbitmqService: RabbitMQService,
    private readonly recalculationService: QueueRecalculationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    this.isConsuming = false;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  private async startConsumer(): Promise<void> {
    if (this.isConsuming) {
      return;
    }
    const channel = this.rabbitmqService.getChannel();
    if (!channel) {
      this.logger.warn(
        'RabbitMQ channel not ready; retrying queue recalculation consumer in 3 seconds',
      );
      this.retryTimeout = setTimeout(() => void this.startConsumer(), 3000);
      return;
    }

    try {
      await channel.prefetch(5);
      await channel.consume(
        QUEUE_RECALCULATION_QUEUE,
        async (msg) => {
          if (!msg) return;
          try {
            const content = JSON.parse(
              msg.content.toString(),
            ) as RecalculationParams;
            await this.recalculationService.recalculateSession(content);
            channel.ack(msg);
          } catch (err: any) {
            this.logger.error(
              `Error processing queue recalculation message: ${err.message}`,
              err.stack,
            );
            // Negative acknowledgment, route to DLX dead-letter queue without endless loop
            channel.nack(msg, false, false);
          }
        },
        { noAck: false },
      );

      this.isConsuming = true;
      this.logger.log('Queue recalculation RabbitMQ consumer started');
    } catch (err: any) {
      this.logger.error(
        `Failed to start queue recalculation consumer: ${err.message}`,
      );
      this.retryTimeout = setTimeout(() => void this.startConsumer(), 5000);
    }
  }
}

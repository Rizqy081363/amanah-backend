import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { RabbitMQService } from '../../../../common/rabbitmq/rabbitmq.service';
import {
  QUEUE_EVENTS_EXCHANGE,
  ROUTING_KEY_QUEUE_PROGRESSION,
} from '../../../../common/rabbitmq/rabbitmq.constants';
import {
  QueueRecalculationService,
  type RecalculationParams,
} from './queue-recalculation.service';

export interface ProgressionEventPayload extends RecalculationParams {
  eventType: 'completed' | 'in_service' | 'called' | 'cancelled' | 'requeued';
  timestamp?: string;
}

@Injectable()
export class QueueEventPublisher {
  private readonly logger = new Logger(QueueEventPublisher.name);

  constructor(
    private readonly rabbitmqService: RabbitMQService,
    @Inject(forwardRef(() => QueueRecalculationService))
    private readonly recalculationService: QueueRecalculationService,
  ) {}

  /**
   * Publishes a queue progression event to RabbitMQ for asynchronous recalculation,
   * with automatic in-process fallback if RabbitMQ is not connected or drops the channel.
   */
  async publishProgression(payload: ProgressionEventPayload): Promise<void> {
    const routingKey = `queue.progression.${payload.eventType}`;
    const message = {
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    let published = false;

    try {
      const channel = this.rabbitmqService.getChannel();
      if (channel) {
        published = await this.rabbitmqService.publish(
          routingKey,
          message,
          QUEUE_EVENTS_EXCHANGE,
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to publish queue event to RabbitMQ (${err.message}). Using in-process direct recalculation fallback.`,
      );
    }

    if (!published) {
      this.logger.log(
        `RabbitMQ unavailable or channel not ready. Executing direct in-process recalculation for [event=${payload.eventType}, date=${payload.serviceDate}].`,
      );
      // Run direct in-process recalculation asynchronously without blocking caller
      setImmediate(() => {
        this.recalculationService
          .recalculateSession({
            serviceDate: payload.serviceDate,
            sessionId: payload.sessionId,
            categoryId: payload.categoryId,
            triggerEvent: payload.eventType,
            ticketId: payload.ticketId,
            appointmentId: payload.appointmentId,
          })
          .catch((err) => {
            this.logger.error(
              `Direct in-process recalculation failed: ${err.message}`,
              err.stack,
            );
          });
      });
    }
  }
}

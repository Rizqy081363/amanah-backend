import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import {
  NOTIFICATIONS_DLX_EXCHANGE,
  NOTIFICATIONS_EXCHANGE,
  NOTIFICATIONS_FAILED_QUEUE,
  NOTIFICATIONS_IN_APP_QUEUE,
  NOTIFICATIONS_PUSH_QUEUE,
  ROUTING_KEY_IN_APP_PATTERN,
  ROUTING_KEY_PUSH_PATTERN,
  QUEUE_EVENTS_EXCHANGE,
  QUEUE_RECALCULATION_QUEUE,
  ROUTING_KEY_QUEUE_PROGRESSION,
} from './rabbitmq.constants';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    const url =
      process.env.RABBITMQ_URL || 'amqp://amanah:amanah_secret@127.0.0.1:5672';
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(NOTIFICATIONS_EXCHANGE, 'topic', {
        durable: true,
      });
      await this.channel.assertExchange(NOTIFICATIONS_DLX_EXCHANGE, 'direct', {
        durable: true,
      });

      await this.channel.assertQueue(NOTIFICATIONS_FAILED_QUEUE, {
        durable: true,
      });
      await this.channel.bindQueue(
        NOTIFICATIONS_FAILED_QUEUE,
        NOTIFICATIONS_DLX_EXCHANGE,
        'notifications.failed',
      );

      await this.channel.assertQueue(NOTIFICATIONS_PUSH_QUEUE, {
        durable: true,
        deadLetterExchange: NOTIFICATIONS_DLX_EXCHANGE,
        deadLetterRoutingKey: 'notifications.failed',
      });
      await this.channel.bindQueue(
        NOTIFICATIONS_PUSH_QUEUE,
        NOTIFICATIONS_EXCHANGE,
        ROUTING_KEY_PUSH_PATTERN,
      );

      await this.channel.assertQueue(NOTIFICATIONS_IN_APP_QUEUE, {
        durable: true,
        deadLetterExchange: NOTIFICATIONS_DLX_EXCHANGE,
        deadLetterRoutingKey: 'notifications.failed',
      });
      await this.channel.bindQueue(
        NOTIFICATIONS_IN_APP_QUEUE,
        NOTIFICATIONS_EXCHANGE,
        ROUTING_KEY_IN_APP_PATTERN,
      );

      await this.channel.assertExchange(QUEUE_EVENTS_EXCHANGE, 'topic', {
        durable: true,
      });
      await this.channel.assertQueue(QUEUE_RECALCULATION_QUEUE, {
        durable: true,
        deadLetterExchange: NOTIFICATIONS_DLX_EXCHANGE,
        deadLetterRoutingKey: 'notifications.failed',
      });
      await this.channel.bindQueue(
        QUEUE_RECALCULATION_QUEUE,
        QUEUE_EVENTS_EXCHANGE,
        ROUTING_KEY_QUEUE_PROGRESSION,
      );

      this.logger.log('Connected to RabbitMQ and declared exchanges and queues');
    } catch (err) {
      this.logger.warn(`Failed to connect to RabbitMQ: ${String(err)}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch {
      this.logger.debug('Channel or connection already closed');
    }
  }

  getChannel(): amqp.Channel | null {
    return this.channel;
  }

  async publish(
    routingKey: string,
    message: unknown,
    exchange: string = NOTIFICATIONS_EXCHANGE,
  ): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn('RabbitMQ channel not ready, dropping message');
      return false;
    }
    const buffer = Buffer.from(JSON.stringify(message));
    return this.channel.publish(exchange, routingKey, buffer, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
    });
  }
}

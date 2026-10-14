import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import * as webpush from 'web-push';
import { NOTIFICATIONS_PUSH_QUEUE } from '../../../../common/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '../../../../common/rabbitmq/rabbitmq.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { roles, userRoles } from '../../../../database/schema';
import { NotificationDispatchCommand } from '../../contracts/notification-dispatch.contract';
import {
  PUSH_SUBSCRIPTION_REPOSITORY,
  type PushSubscriptionRepository,
} from '../../domain/repositories/push-subscription.repository';

@Injectable()
export class PushNotificationQueueWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PushNotificationQueueWorker.name);
  private isConsuming = false;
  private vapidConfigured = false;

  constructor(
    private readonly rabbitmqService: RabbitMQService,
    @Inject(PUSH_SUBSCRIPTION_REPOSITORY)
    private readonly pushSubscriptionRepo: PushSubscriptionRepository,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    this.configureVapid();
    await this.startConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    this.isConsuming = false;
  }

  private configureVapid(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject =
      process.env.VAPID_SUBJECT || 'mailto:admin@amanah-healthcare.local';

    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        this.vapidConfigured = true;
        this.logger.log('Web Push VAPID credentials configured');
      } catch (err) {
        this.logger.warn(`Failed to configure VAPID: ${String(err)}`);
      }
    } else {
      this.logger.warn('VAPID keys not set. Web Push delivery disabled');
    }
  }

  private async startConsumer(): Promise<void> {
    const channel = this.rabbitmqService.getChannel();
    if (!channel) {
      this.logger.warn(
        'RabbitMQ channel not ready; retrying push consumer in 3 seconds',
      );
      setTimeout(() => void this.startConsumer(), 3000);
      return;
    }

    try {
      await channel.prefetch(10);
      await channel.consume(
        NOTIFICATIONS_PUSH_QUEUE,
        async (msg) => {
          if (!msg) return;
          try {
            const content = JSON.parse(
              msg.content.toString(),
            ) as NotificationDispatchCommand;
            await this.processPushCommand(content);
            channel.ack(msg);
          } catch (err) {
            this.logger.error(`Error processing push message: ${String(err)}`);
            channel.nack(msg, false, false);
          }
        },
        { noAck: false },
      );

      this.isConsuming = true;
      this.logger.log('Push notification queue consumer started');
    } catch (err) {
      this.logger.error(`Failed to start push queue consumer: ${String(err)}`);
    }
  }

  private async processPushCommand(
    command: NotificationDispatchCommand,
  ): Promise<void> {
    const targetUserIds = await this.resolveTargetUserIds(command);
    if (targetUserIds.length === 0) {
      return;
    }

    const subscriptions =
      await this.pushSubscriptionRepo.findByUserIds(targetUserIds);
    if (subscriptions.length === 0) {
      return;
    }

    const payload = JSON.stringify({
      title: command.content.title,
      body: command.content.body,
      actionUrl: command.content.actionUrl || '/dashboard',
      data: command.content.data || {},
      vibrationPattern: command.vibrationPattern || [300, 100, 300, 100, 300],
      tag: command.commandId,
      badge: '/apple-touch-icon.png',
      icon: '/logo-symbol-only.png',
    });

    for (const sub of subscriptions) {
      if (!this.vapidConfigured) continue;

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dhKey,
          auth: sub.authKey,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payload, {
          TTL: 86400,
          urgency: command.priority === 'high' ? 'high' : 'normal',
        });
      } catch (err: any) {
        const statusCode = err?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await this.pushSubscriptionRepo.deleteByEndpoint(sub.endpoint);
        } else {
          this.logger.warn(
            `Failed push delivery to endpoint ${sub.endpoint.slice(0, 30)}...: ${String(err)}`,
          );
        }
      }
    }
  }

  private async resolveTargetUserIds(
    command: NotificationDispatchCommand,
  ): Promise<string[]> {
    const { target } = command;
    if (target.type === 'user') {
      return target.recipientUserIds || [];
    }

    if (target.type === 'role' && target.roles && target.roles.length > 0) {
      const normalizedRoles = target.roles.map((r) => r.toLowerCase());
      const rows = await this.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
        .where(inArray(sql`lower(${roles.code})`, normalizedRoles));

      return [...new Set(rows.map((r) => r.userId))];
    }

    if (target.type === 'broadcast') {
      const allSubs = await this.pushSubscriptionRepo.findAllActive();
      return [...new Set(allSubs.map((s) => s.userId))];
    }

    return [];
  }
}

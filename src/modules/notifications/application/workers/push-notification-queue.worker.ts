import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import * as webpush from 'web-push';
import { NOTIFICATIONS_PUSH_QUEUE } from '../../../../common/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '../../../../common/rabbitmq/rabbitmq.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { roles, userRoles } from '../../../../database/schema';
import { NotificationDispatchCommand } from '../../contracts/notification-dispatch.contract';
import {
  DEVICE_SUBSCRIPTION_REPOSITORY,
  type DeviceSubscriptionRepository,
} from '../../domain/repositories/device-subscription.repository';
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
  private firebaseConfigured = false;

  constructor(
    private readonly rabbitmqService: RabbitMQService,
    @Inject(PUSH_SUBSCRIPTION_REPOSITORY)
    private readonly pushSubscriptionRepo: PushSubscriptionRepository,
    @Inject(DEVICE_SUBSCRIPTION_REPOSITORY)
    private readonly deviceSubscriptionRepo: DeviceSubscriptionRepository,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    this.configureVapid();
    this.configureFirebase();
    await this.startConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    this.isConsuming = false;
  }

  private configureFirebase(): void {
    if (getApps().length > 0) {
      this.firebaseConfigured = true;
      return;
    }

    try {
      const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const candidatePaths = [
        configuredPath,
        configuredPath ? path.resolve(process.cwd(), configuredPath) : null,
        path.resolve(process.cwd(), 'config', 'firebase-adminsdk.json'),
        path.resolve(__dirname, '../../../../../config/firebase-adminsdk.json'),
      ].filter((p): p is string => Boolean(p));

      let resolvedPath: string | null = null;
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          resolvedPath = p;
          break;
        }
      }

      if (resolvedPath) {
        const serviceAccount = JSON.parse(
          fs.readFileSync(resolvedPath, 'utf8'),
        );
        initializeApp({
          credential: cert(serviceAccount),
        });
        this.firebaseConfigured = true;
        this.logger.log(
          `Firebase Admin SDK initialized successfully with credentials from ${resolvedPath}`,
        );
      } else {
        this.logger.warn(
          'Firebase Admin SDK credentials not found; mobile push disabled',
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to initialize Firebase Admin SDK: ${String(err)}`,
      );
    }
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

    // 1. Deliver to Web Push Subscriptions
    await this.deliverWebPush(targetUserIds, command);

    // 2. Deliver to Mobile Devices via FCM
    await this.deliverMobileFcm(targetUserIds, command);
  }

  private async deliverWebPush(
    targetUserIds: string[],
    command: NotificationDispatchCommand,
  ): Promise<void> {
    if (!this.vapidConfigured) return;

    const subscriptions =
      await this.pushSubscriptionRepo.findByUserIds(targetUserIds);
    if (subscriptions.length === 0) return;

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

  private async deliverMobileFcm(
    targetUserIds: string[],
    command: NotificationDispatchCommand,
  ): Promise<void> {
    if (!this.firebaseConfigured) return;

    const devices =
      await this.deviceSubscriptionRepo.findActiveTokensByUserIds(
        targetUserIds,
      );
    if (devices.length === 0) return;

    const messaging = getMessaging();
    const dataPayload: Record<string, string> = {
      commandId: command.commandId || '',
      actionUrl: command.content.actionUrl || '',
    };
    if (command.content.data) {
      for (const [key, value] of Object.entries(command.content.data)) {
        if (value !== undefined && value !== null) {
          dataPayload[key] =
            typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
      }
    }

    for (const device of devices) {
      try {
        await messaging.send({
          token: device.pushToken,
          notification: {
            title: command.content.title,
            body: command.content.body,
          },
          data: dataPayload,
          android: {
            priority: command.priority === 'high' ? 'high' : 'normal',
            notification: {
              channelId: 'high_importance_channel',
              sound: 'default',
              clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        });
        this.logger.log(
          `Delivered FCM push to user ${device.userId} (device: ${device.id})`,
        );
      } catch (err: any) {
        const code = err?.code || err?.errorInfo?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          this.logger.warn(`Revoking invalid device token: ${device.id}`);
          await this.deviceSubscriptionRepo.markTokenInvalid(device.id);
        } else {
          this.logger.warn(
            `FCM send failure for device ${device.id}: ${String(err)}`,
          );
        }
      }
    }
  }

  private async resolveTargetUserIds(
    command: NotificationDispatchCommand,
  ): Promise<string[]> {
    const { target } = command;
    let recipientIds: string[] = [];

    if (target.type === 'user') {
      recipientIds = target.recipientUserIds || [];
    } else if (
      target.type === 'role' &&
      target.roles &&
      target.roles.length > 0
    ) {
      const normalizedRoles = target.roles.map((r) => r.toLowerCase());
      const rows = await this.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
        .where(inArray(sql`lower(${roles.code})`, normalizedRoles));

      recipientIds = [...new Set(rows.map((r) => r.userId))];
    } else if (target.type === 'broadcast') {
      const allSubs = await this.pushSubscriptionRepo.findAllActive();
      recipientIds = [...new Set(allSubs.map((s) => s.userId))];
    }

    if (target.excludedUserIds && target.excludedUserIds.length > 0) {
      const excluded = new Set(target.excludedUserIds);
      return recipientIds.filter((id) => !excluded.has(id));
    }

    return recipientIds;
  }
}

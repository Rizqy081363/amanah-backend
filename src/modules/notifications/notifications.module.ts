import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { RedisStreamsPublisher } from './application/publishers/redis-streams.publisher';
import { NotificationGatewayService } from './application/services/notification-gateway.service';
import { NotificationOrchestratorService } from './application/services/notification-orchestrator.service';
import { RealtimeTicketService } from './application/services/realtime-ticket.service';
import { InAppNotificationQueueWorker } from './application/workers/in-app-notification-queue.worker';
import { NotificationStreamWorker } from './application/workers/notification-stream.worker';
import { PushNotificationQueueWorker } from './application/workers/push-notification-queue.worker';
import { PUSH_SUBSCRIPTION_REPOSITORY } from './domain/repositories/push-subscription.repository';
import { InAppDeliveryChannel } from './infrastructure/channels/in-app-delivery.channel';
import { PushDeliveryChannel } from './infrastructure/channels/push-delivery.channel';
import { DeviceSubscriptionDrizzleRepository } from './infrastructure/drizzle/device-subscription.drizzle-repository';
import { NotificationDrizzleRepository } from './infrastructure/drizzle/notification.drizzle-repository';
import { PushSubscriptionDrizzleRepository } from './infrastructure/drizzle/push-subscription.drizzle-repository';
import { SocketIoRealtimeGateway } from './infrastructure/realtime/socket-io-realtime.gateway';
import {
  DELIVERY_CHANNEL_ADAPTERS,
  DEVICE_SUBSCRIPTION_REPOSITORY,
  NOTIFICATION_PUBLISHER,
  NOTIFICATION_REPOSITORY,
  NOTIFICATION_RULES_REGISTRY,
  REALTIME_GATEWAY_PORT,
} from './notifications.constants';
import { NotificationsController } from './presentation/notifications.controller';
import { PushSubscriptionController } from './presentation/push-subscription.controller';
import { RealtimeTicketController } from './presentation/realtime-ticket.controller';
import { NotificationRulesRegistry } from './registry/notification-rules-registry';

@Global()
@Module({
  imports: [DrizzleModule, ConfigModule, JwtModule.register({})],
  controllers: [
    NotificationsController,
    RealtimeTicketController,
    PushSubscriptionController,
  ],
  providers: [
    RealtimeTicketService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: NotificationDrizzleRepository,
    },
    {
      provide: PUSH_SUBSCRIPTION_REPOSITORY,
      useClass: PushSubscriptionDrizzleRepository,
    },
    {
      provide: DEVICE_SUBSCRIPTION_REPOSITORY,
      useClass: DeviceSubscriptionDrizzleRepository,
    },
    SocketIoRealtimeGateway,
    {
      provide: REALTIME_GATEWAY_PORT,
      useExisting: SocketIoRealtimeGateway,
    },
    InAppDeliveryChannel,
    PushDeliveryChannel,
    {
      provide: DELIVERY_CHANNEL_ADAPTERS,
      useFactory: (
        inApp: InAppDeliveryChannel,
        push: PushDeliveryChannel,
      ) => [inApp, push],
      inject: [InAppDeliveryChannel, PushDeliveryChannel],
    },
    NotificationRulesRegistry,
    {
      provide: NOTIFICATION_RULES_REGISTRY,
      useExisting: NotificationRulesRegistry,
    },
    RedisStreamsPublisher,
    {
      provide: NOTIFICATION_PUBLISHER,
      useExisting: RedisStreamsPublisher,
    },
    NotificationOrchestratorService,
    NotificationStreamWorker,
    PushNotificationQueueWorker,
    InAppNotificationQueueWorker,
    NotificationGatewayService,
  ],
  exports: [
    NOTIFICATION_REPOSITORY,
    PUSH_SUBSCRIPTION_REPOSITORY,
    DEVICE_SUBSCRIPTION_REPOSITORY,
    NOTIFICATION_PUBLISHER,
    RedisStreamsPublisher,
    REALTIME_GATEWAY_PORT,
    SocketIoRealtimeGateway,
    NOTIFICATION_RULES_REGISTRY,
    NotificationRulesRegistry,
    NotificationOrchestratorService,
    NotificationGatewayService,
    RealtimeTicketService,
  ],
})
export class NotificationsModule {}

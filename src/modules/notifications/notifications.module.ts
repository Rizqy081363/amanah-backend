import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { RedisStreamsPublisher } from './application/publishers/redis-streams.publisher';
import { NotificationOrchestratorService } from './application/services/notification-orchestrator.service';
import { NotificationStreamWorker } from './application/workers/notification-stream.worker';
import { InAppDeliveryChannel } from './infrastructure/channels/in-app-delivery.channel';
import { NotificationDrizzleRepository } from './infrastructure/drizzle/notification.drizzle-repository';
import { SocketIoRealtimeGateway } from './infrastructure/realtime/socket-io-realtime.gateway';
import {
  DELIVERY_CHANNEL_ADAPTERS,
  NOTIFICATION_PUBLISHER,
  NOTIFICATION_REPOSITORY,
  NOTIFICATION_RULES_REGISTRY,
  REALTIME_GATEWAY_PORT,
} from './notifications.constants';
import { NotificationsController } from './presentation/notifications.controller';
import { NotificationRulesRegistry } from './registry/notification-rules-registry';

@Global()
@Module({
  imports: [DrizzleModule, ConfigModule, JwtModule.register({})],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: NotificationDrizzleRepository,
    },
    SocketIoRealtimeGateway,
    {
      provide: REALTIME_GATEWAY_PORT,
      useExisting: SocketIoRealtimeGateway,
    },
    InAppDeliveryChannel,
    {
      provide: DELIVERY_CHANNEL_ADAPTERS,
      useFactory: (inApp: InAppDeliveryChannel) => [inApp],
      inject: [InAppDeliveryChannel],
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
  ],
  exports: [
    NOTIFICATION_REPOSITORY,
    NOTIFICATION_PUBLISHER,
    RedisStreamsPublisher,
    REALTIME_GATEWAY_PORT,
    NOTIFICATION_RULES_REGISTRY,
    NotificationRulesRegistry,
    NotificationOrchestratorService,
  ],
})
export class NotificationsModule {}

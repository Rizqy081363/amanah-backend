import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatNotificationPublisher } from './application/publishers/chat-notification.publisher';
import { ChatService } from './application/services/chat.service';
import { CHAT_REPOSITORY } from './domain/repositories/chat.repository.interface';
import { ChatDrizzleRepository } from './infrastructure/drizzle/chat.drizzle.repository';
import { ChatNotificationRules } from './infrastructure/notifications/chat.notifications';
import { ChatRecipientResolver } from './infrastructure/resolvers/chat-recipient.resolver';
import { AdminChatController } from './presentation/controllers/admin-chat.controller';
import { ChatController } from './presentation/controllers/chat.controller';
import { OptionalJwtAuthGuard } from './presentation/guards/optional-jwt-auth.guard';

@Module({
  imports: [DrizzleModule, NotificationsModule],
  controllers: [ChatController, AdminChatController],
  providers: [
    ChatService,
    ChatRecipientResolver,
    ChatNotificationPublisher,
    ChatNotificationRules,
    OptionalJwtAuthGuard,
    {
      provide: CHAT_REPOSITORY,
      useClass: ChatDrizzleRepository,
    },
  ],
  exports: [
    ChatService,
    CHAT_REPOSITORY,
    ChatNotificationPublisher,
    ChatRecipientResolver,
  ],
})
export class ChatModule {}

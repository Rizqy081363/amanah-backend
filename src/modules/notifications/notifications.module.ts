import { Module } from '@nestjs/common';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { NOTIFICATION_REPOSITORY } from './domain/repositories/notification.repository';
import { NotificationDrizzleRepository } from './infrastructure/drizzle/notification.drizzle-repository';
import { NotificationsController } from './presentation/notifications.controller';

@Module({
  imports: [DrizzleModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: NotificationDrizzleRepository,
    },
  ],
  exports: [NOTIFICATION_REPOSITORY],
})
export class NotificationsModule {}

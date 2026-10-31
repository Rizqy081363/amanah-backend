import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ACCESS_CONTROL_REPOSITORY } from './domain/repositories/access-control.repository.interface';
import { AccessControlDrizzleRepository } from './infrastructure/drizzle/access-control.drizzle-repository';
import { AccessControlService } from './application/services/access-control.service';
import { AdminRolesController } from './presentation/admin-roles.controller';
import { AdminPermissionsController } from './presentation/admin-permissions.controller';
import { AdminPagesController } from './presentation/admin-pages.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [
    AdminRolesController,
    AdminPermissionsController,
    AdminPagesController,
  ],
  providers: [
    AccessControlService,
    {
      provide: ACCESS_CONTROL_REPOSITORY,
      useClass: AccessControlDrizzleRepository,
    },
  ],
  exports: [AccessControlService, ACCESS_CONTROL_REPOSITORY],
})
export class AccessControlModule {}

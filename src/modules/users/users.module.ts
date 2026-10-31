import { Module } from '@nestjs/common';
import { USER_MANAGEMENT_REPOSITORY } from './domain/repositories/user-management.repository.interface';
import { UserManagementDrizzleRepository } from './infrastructure/drizzle/user-management.drizzle-repository';
import { JsonUserBackupDriver } from './infrastructure/drivers/json-user-backup.driver';
import { CsvUserBackupDriver } from './infrastructure/drivers/csv-user-backup.driver';
import { SqlUserBackupDriver } from './infrastructure/drivers/sql-user-backup.driver';
import { UserBackupDriverRegistry } from './infrastructure/drivers/user-backup-driver.registry';
import { UserManagementService } from './application/services/user-management.service';
import { UsersController } from './presentation/users.controller';

@Module({
  controllers: [UsersController],
  providers: [
    JsonUserBackupDriver,
    CsvUserBackupDriver,
    SqlUserBackupDriver,
    UserBackupDriverRegistry,
    UserManagementService,
    {
      provide: USER_MANAGEMENT_REPOSITORY,
      useClass: UserManagementDrizzleRepository,
    },
  ],
  exports: [UserManagementService, USER_MANAGEMENT_REPOSITORY],
})
export class UsersModule {}

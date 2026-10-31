import { Inject, Injectable } from '@nestjs/common';
import {
  DriverMetadata,
  ExportDriverContext,
  RestoreExecutionContext,
  RestoreExecutionResult,
  RestoreValidationResult,
} from '../../domain/drivers/user-backup-driver.interface';
import {
  UserDirectoryEntity,
  UserListPaginatedResult,
  UserRoleSummary,
} from '../../domain/entities/user-directory.entity';
import {
  BulkPurgeResult,
  BulkStatusResult,
  IUserManagementRepository,
  QueryUsersParams,
  UpdateUserRepoInput,
  USER_MANAGEMENT_REPOSITORY,
} from '../../domain/repositories/user-management.repository.interface';
import { UserBackupDriverRegistry } from '../../infrastructure/drivers/user-backup-driver.registry';
import { UserStatus } from '../../../../common/constants';

@Injectable()
export class UserManagementService {
  constructor(
    @Inject(USER_MANAGEMENT_REPOSITORY)
    private readonly repository: IUserManagementRepository,
    private readonly driverRegistry: UserBackupDriverRegistry,
  ) {}

  async findUsers(params: QueryUsersParams): Promise<UserListPaginatedResult> {
    return this.repository.findUsers(params);
  }

  async getUserById(id: string): Promise<UserDirectoryEntity | null> {
    return this.repository.findById(id);
  }

  async getAllActiveRoles(): Promise<UserRoleSummary[]> {
    return this.repository.getAllActiveRoles();
  }

  async updateUser(
    id: string,
    input: UpdateUserRepoInput,
    actorAdminId: string,
  ): Promise<UserDirectoryEntity> {
    return this.repository.updateUser(id, input, actorAdminId);
  }

  async updateUserStatus(
    id: string,
    status: UserStatus,
    actorAdminId: string,
  ): Promise<void> {
    return this.repository.updateStatus(id, status, actorAdminId);
  }

  async bulkUpdateUserStatus(
    ids: string[],
    status: UserStatus,
    actorAdminId: string,
  ): Promise<BulkStatusResult> {
    return this.repository.bulkUpdateStatus(ids, status, actorAdminId);
  }

  async purgeUser(
    id: string,
    actorAdminId: string,
  ): Promise<{ success: boolean; details: any }> {
    return this.repository.purgeUser(id, actorAdminId);
  }

  async bulkPurgeUsers(
    ids: string[],
    actorAdminId: string,
  ): Promise<BulkPurgeResult> {
    return this.repository.bulkPurgeUsers(ids, actorAdminId);
  }

  getAvailableBackupDrivers(): DriverMetadata[] {
    return this.driverRegistry.getSupportedDrivers();
  }

  async exportUsers(
    format: string,
    exportedBy: string,
  ): Promise<{
    data: string | Buffer;
    filename: string;
    mimeType: string;
    total: number;
  }> {
    const driver = this.driverRegistry.getDriver(format);
    const users = await this.repository.getAllUsersForExport();

    const context: ExportDriverContext = {
      clinicLocale: 'id-ID',
      timeZone: process.env.CLINIC_TIMEZONE || 'Asia/Jakarta',
      dateFormatStyle: 'human_full',
      exportedBy,
    };

    const data = await driver.export(users, context);
    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `amanah_users_backup_${dateStamp}${driver.extension}`;

    return {
      data,
      filename,
      mimeType: driver.mimeType,
      total: users.length,
    };
  }

  async previewRestore(
    format: string,
    rawContent: string,
  ): Promise<RestoreValidationResult> {
    const driver = this.driverRegistry.getDriver(format);
    const existingEmails = await this.repository.getAllUserEmails();
    const activeRolesByCode = await this.repository.getActiveRolesMap();

    return driver.validate(rawContent, existingEmails, activeRolesByCode);
  }

  async executeRestore(
    format: string,
    rawContent: string,
    duplicateStrategy: 'skip' | 'update',
    actorUserId: string,
  ): Promise<RestoreExecutionResult> {
    const driver = this.driverRegistry.getDriver(format);
    const context: RestoreExecutionContext = {
      actorUserId,
      duplicateStrategy,
    };

    return driver.restore(rawContent, context, this.repository);
  }
}

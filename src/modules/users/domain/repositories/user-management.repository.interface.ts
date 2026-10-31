import { UserStatus } from '../../../../common/constants';
import {
  UserDirectoryEntity,
  UserListPaginatedResult,
  UserRoleSummary,
} from '../entities/user-directory.entity';

export interface QueryUsersParams {
  search?: string;
  roleId?: string;
  status?: string;
  audience?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface BulkStatusResult {
  affectedCount: number;
  skippedCount: number;
  skippedReasons: string[];
}

export interface BulkPurgeResult {
  successCount: number;
  failureCount: number;
  details: { id: string; status: string; reason?: string }[];
}

export interface BatchCreateUserInput {
  name: string;
  email: string;
  phone?: string | null;
  roleIds: string[];
  status: UserStatus;
}

export interface BatchUpdateUserInput {
  email: string;
  name?: string;
  phone?: string | null;
}

export interface UpdateUserRepoInput {
  name: string;
  email: string;
  phone?: string | null;
  status?: UserStatus;
  preferredLocale?: string;
  roleIds?: string[];
}

export const USER_MANAGEMENT_REPOSITORY = Symbol('USER_MANAGEMENT_REPOSITORY');

export interface IUserManagementRepository {
  findUsers(params: QueryUsersParams): Promise<UserListPaginatedResult>;
  findById(id: string): Promise<UserDirectoryEntity | null>;
  findByEmail(email: string): Promise<UserDirectoryEntity | null>;
  getAllUsersForExport(): Promise<UserDirectoryEntity[]>;
  updateUser(
    id: string,
    input: UpdateUserRepoInput,
    actorAdminId: string,
  ): Promise<UserDirectoryEntity>;
  updateStatus(
    id: string,
    status: UserStatus,
    actorAdminId: string,
  ): Promise<void>;
  bulkUpdateStatus(
    ids: string[],
    status: UserStatus,
    actorAdminId: string,
  ): Promise<BulkStatusResult>;
  purgeUser(
    id: string,
    actorAdminId: string,
  ): Promise<{ success: boolean; details: any }>;
  bulkPurgeUsers(ids: string[], actorAdminId: string): Promise<BulkPurgeResult>;
  countActiveAdmins(excludeUserId?: string): Promise<number>;
  getAllActiveRoles(): Promise<UserRoleSummary[]>;
  getActiveRolesMap(): Promise<Map<string, string>>;
  getAllUserEmails(): Promise<Set<string>>;
  batchCreateUsers(
    records: BatchCreateUserInput[],
    actorAdminId: string,
  ): Promise<{ created: number; skipped: number }>;
  batchUpdateUsers(records: BatchUpdateUserInput[]): Promise<number>;
}

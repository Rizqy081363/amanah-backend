import { RoleAudience, RoleEntity } from '../entities/role.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { ApplicationPageEntity } from '../entities/application-page.entity';

export const ACCESS_CONTROL_REPOSITORY = Symbol('ACCESS_CONTROL_REPOSITORY');

export interface CreateRoleInput {
  code?: string;
  name: string;
  description?: string | null;
  audience?: RoleAudience;
  isClinical?: boolean;
  isActive?: boolean;
  isDefault?: boolean;
  permissionIds?: string[];
  pageIds?: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  audience?: RoleAudience;
  isClinical?: boolean;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface AccessControlRepository {
  findAllRoles(): Promise<RoleEntity[]>;
  findRoleTree(): Promise<RoleEntity[]>;
  findRoleById(id: string): Promise<RoleEntity | null>;
  findRoleByCode(code: string): Promise<RoleEntity | null>;
  createRole(data: CreateRoleInput): Promise<RoleEntity>;
  updateRole(id: string, data: UpdateRoleInput): Promise<RoleEntity>;
  deleteRole(id: string): Promise<void>;
  findAllPermissions(): Promise<PermissionEntity[]>;
  findPermissionById(id: string): Promise<PermissionEntity | null>;
  findPermissionsGrouped(): Promise<Record<string, PermissionEntity[]>>;
  assignPermissionsToRole(
    roleId: string,
    permissionIds: string[],
  ): Promise<void>;
  addPermissionToRole(roleId: string, permissionId: string): Promise<void>;
  removePermissionFromRole(roleId: string, permissionId: string): Promise<void>;
  getEffectivePermissionsByRoleId(roleId: string): Promise<string[]>;
  getUserEffectivePermissions(userId: string): Promise<string[]>;
  findAllPages(): Promise<ApplicationPageEntity[]>;
  findPageTree(audience?: RoleAudience): Promise<ApplicationPageEntity[]>;
  findPageById(id: string): Promise<ApplicationPageEntity | null>;
  togglePageEnabled(
    id: string,
    isEnabled: boolean,
  ): Promise<ApplicationPageEntity>;
  findRolePageIds(roleId: string): Promise<string[]>;
  assignPagesToRole(roleId: string, pageIds: string[]): Promise<void>;
  getEffectiveRoutesForRole(roleId: string): Promise<string[]>;
  getUserEffectiveRoutes(userId: string): Promise<string[]>;
}

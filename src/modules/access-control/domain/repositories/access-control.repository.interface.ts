import { RoleAudience, RoleEntity, RoleTier } from '../entities/role.entity';
import { PermissionEntity } from '../entities/permission.entity';

export const ACCESS_CONTROL_REPOSITORY = Symbol('ACCESS_CONTROL_REPOSITORY');

export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string | null;
  parentRoleId?: string | null;
  tier?: RoleTier;
  audience?: RoleAudience;
  isClinical?: boolean;
  permissionIds?: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  parentRoleId?: string | null;
  tier?: RoleTier;
  audience?: RoleAudience;
  isClinical?: boolean;
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
  assignPermissionsToRole(roleId: string, permissionIds: string[]): Promise<void>;
  addPermissionToRole(roleId: string, permissionId: string): Promise<void>;
  removePermissionFromRole(roleId: string, permissionId: string): Promise<void>;
  getEffectivePermissionsByRoleId(roleId: string): Promise<string[]>;
  getUserEffectivePermissions(userId: string): Promise<string[]>;
}

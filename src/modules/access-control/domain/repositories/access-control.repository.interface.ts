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

export interface CreatePageData {
  slug: string;
  name: string;
  description?: string | null;
  routePath?: string;
  parentPageId?: string | null;
  audience?: RoleAudience;
  customAlias?: string | null;
  icon?: string | null;
  displayOrder?: number;
}

export interface UpdatePageData {
  name?: string;
  description?: string | null;
  icon?: string | null;
  displayOrder?: number;
  parentPageId?: string | null;
  routePath?: string;
  customAlias?: string | null;
  isEnabled?: boolean;
}

export interface BulkPageActionData {
  action: 'move' | 'detach' | 'toggle_status' | 'restore' | 'reorder';
  pageIds: string[];
  targetParentId?: string | null;
  isEnabled?: boolean;
  restoreStates?: Array<{
    id: string;
    parentPageId?: string | null;
    displayOrder?: number;
    isEnabled?: boolean;
  }>;
}

export interface BulkPageActionResult {
  success: boolean;
  updatedCount: number;
  affectedPageIds: string[];
  previousStates: Array<{
    id: string;
    name: string;
    parentPageId: string | null;
    displayOrder: number;
    isEnabled: boolean;
  }>;
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
  findAllRouteAliases(): Promise<Record<string, string>>;
  findPageTree(audience?: RoleAudience): Promise<ApplicationPageEntity[]>;
  findPageById(id: string): Promise<ApplicationPageEntity | null>;
  createPage(data: CreatePageData): Promise<ApplicationPageEntity>;
  updatePage(id: string, data: UpdatePageData): Promise<ApplicationPageEntity>;
  detachChildren(parentId: string): Promise<number>;
  bulkPageAction(data: BulkPageActionData): Promise<BulkPageActionResult>;
  deletePage(id: string): Promise<void>;
  togglePageEnabled(
    id: string,
    isEnabled: boolean,
  ): Promise<ApplicationPageEntity>;
  findRolePageIds(roleId: string): Promise<string[]>;
  assignPagesToRole(roleId: string, pageIds: string[]): Promise<void>;
  getEffectiveRoutesForRole(roleId: string): Promise<string[]>;
  getUserEffectiveRoutes(userId: string): Promise<string[]>;
}

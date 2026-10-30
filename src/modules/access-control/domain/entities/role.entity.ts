import { PermissionEntity } from './permission.entity';

export type RoleTier = 'macro' | 'micro';
export type RoleAudience = 'internal' | 'external';

export class RoleEntity {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  parentRoleId?: string | null;
  tier: RoleTier;
  audience: RoleAudience;
  isClinical: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  parentRole?: RoleEntity | null;
  children?: RoleEntity[];
  permissions?: PermissionEntity[];
  effectivePermissionCodes?: string[];
  staffCount?: number;
}

import { PermissionEntity } from './permission.entity';
import {
  ROLE_AUDIENCE,
  type RoleAudience,
} from '../../../../common/constants/role-audience.constants';

export { ROLE_AUDIENCE, type RoleAudience };
export type RoleTier = 'macro' | 'micro';

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
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  parentRole?: RoleEntity | null;
  children?: RoleEntity[];
  permissions?: PermissionEntity[];
  effectivePermissionCodes?: string[];
  staffCount?: number;
}

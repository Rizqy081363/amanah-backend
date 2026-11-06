import { PermissionEntity } from './permission.entity';
import {
  ROLE_AUDIENCE,
  type RoleAudience,
} from '../../../../common/constants/role-audience.constants';

export { ROLE_AUDIENCE, type RoleAudience };

export class RoleEntity {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  audience: RoleAudience;
  isClinical: boolean;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  permissions?: PermissionEntity[];
  effectivePermissionCodes?: string[];
  userCount?: number;
  staffCount?: number;
}

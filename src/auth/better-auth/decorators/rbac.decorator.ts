import { SetMetadata } from '@nestjs/common';
import type { RoleName, statement } from '../permissions';

export const BETTER_AUTH_ROLES_KEY = 'better_auth_roles';
const RequireRoles = (...roles: RoleName[]) =>
  SetMetadata(BETTER_AUTH_ROLES_KEY, roles);

export const BETTER_AUTH_PERMISSION_KEY = 'better_auth_permission';
export interface RequiredPermission<
  R extends keyof typeof statement = keyof typeof statement,
> {
  resource: R;
  action: (typeof statement)[R][number];
}

const RequirePermission = <R extends keyof typeof statement>(
  resource: R,
  action: (typeof statement)[R][number],
) => SetMetadata(BETTER_AUTH_PERMISSION_KEY, { resource, action });

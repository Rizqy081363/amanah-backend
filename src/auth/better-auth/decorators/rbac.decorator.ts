import type { statement } from '../permissions';

export const BETTER_AUTH_ROLES_KEY = 'better_auth_roles';

export const BETTER_AUTH_PERMISSION_KEY = 'better_auth_permission';
export interface RequiredPermission<
  R extends keyof typeof statement = keyof typeof statement,
> {
  resource: R;
  action: (typeof statement)[R][number];
}

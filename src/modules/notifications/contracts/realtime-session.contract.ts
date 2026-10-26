import type { CanonicalRole } from '../../../auth/constants/auth.constants';

export interface RealtimePrincipal {
  readonly userId: string;
  readonly roleCode: CanonicalRole | string;
  readonly roles: readonly string[];
}

export interface RealtimeTicketPayload {
  readonly userId: string;
  readonly roleCode: CanonicalRole | string;
  readonly roles: readonly string[];
  readonly issuedAt: number;
}

export function createRealtimePrincipal(user: {
  id: string;
  roleCode: string;
  roles?: string[];
}): RealtimePrincipal {
  return {
    userId: user.id,
    roleCode: user.roleCode,
    roles:
      Array.isArray(user.roles) && user.roles.length > 0
        ? user.roles
        : [user.roleCode],
  };
}

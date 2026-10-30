export interface RealtimePrincipal {
  readonly userId: string;
  readonly roleCode: string;
  readonly roles: readonly string[];
  readonly audience: 'internal' | 'external';
}

export interface RealtimeTicketPayload {
  readonly userId: string;
  readonly roleCode: string;
  readonly roles: readonly string[];
  readonly audience: 'internal' | 'external';
  readonly issuedAt: number;
}

export function createRealtimePrincipal(user: {
  id: string;
  roleCode: string;
  roles?: string[];
  audience: 'internal' | 'external';
}): RealtimePrincipal {
  return {
    userId: user.id,
    roleCode: user.roleCode,
    roles:
      Array.isArray(user.roles) && user.roles.length > 0
        ? user.roles
        : [user.roleCode],
    audience: user.audience,
  };
}

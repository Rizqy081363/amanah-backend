export interface AuditLogEntity {
  id: string;
  actorUserId: string | null;
  actorRoleCode: string | null;
  action: string;
  entityTable: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

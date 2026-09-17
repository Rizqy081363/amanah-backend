import { AuditLogEntity } from '../entities/audit-log.entity';

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export interface CreateAuditLogData {
  actorUserId?: string | null;
  actorRoleCode?: string | null;
  action: string;
  entityTable: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface QueryAuditLogFilters {
  entityTable?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  cursor?: string;
}

export interface AuditLogRepository {
  create(data: CreateAuditLogData): Promise<AuditLogEntity>;
  findAll(
    limit: number,
    offset: number,
    filters?: QueryAuditLogFilters,
  ): Promise<{
    items: AuditLogEntity[];
    total: number;
    nextCursor?: string | null;
    hasNextPage?: boolean;
  }>;
  findById(id: string): Promise<AuditLogEntity | null>;
}

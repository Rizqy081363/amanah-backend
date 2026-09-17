import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, lt, or } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../../../../common/pagination';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { auditLogs } from '../../../../database/schema';
import { AuditLogEntity } from '../../domain/entities/audit-log.entity';
import {
  AuditLogRepository,
  CreateAuditLogData,
  QueryAuditLogFilters,
} from '../../domain/repositories/audit-log.repository';

@Injectable()
export class AuditLogDrizzleRepository implements AuditLogRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(data: CreateAuditLogData): Promise<AuditLogEntity> {
    const [inserted] = await this.db
      .insert(auditLogs)
      .values({
        actorUserId: data.actorUserId || null,
        actorRoleCode: data.actorRoleCode || null,
        action: data.action,
        entityTable: data.entityTable,
        entityId: data.entityId || null,
        oldValues: data.oldValues || null,
        newValues: data.newValues || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      })
      .returning();

    return this.mapToEntity(inserted);
  }

  async findAll(
    limit: number,
    offset: number,
    filters?: QueryAuditLogFilters,
  ): Promise<{
    items: AuditLogEntity[];
    total: number;
    nextCursor?: string | null;
    hasNextPage?: boolean;
  }> {
    const conditions = [];

    if (filters?.entityTable) {
      conditions.push(eq(auditLogs.entityTable, filters.entityTable));
    }
    if (filters?.entityId) {
      conditions.push(eq(auditLogs.entityId, filters.entityId));
    }
    if (filters?.actorUserId) {
      conditions.push(eq(auditLogs.actorUserId, filters.actorUserId));
    }
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }

    if (filters?.cursor) {
      const cursorPayload = decodeCursor(filters.cursor);
      const cursorIso = cursorPayload.createdAt.toISOString();
      conditions.push(
        or(
          lt(auditLogs.createdAt, cursorIso),
          and(
            eq(auditLogs.createdAt, cursorIso),
            lt(auditLogs.id, cursorPayload.id),
          ),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await this.db
      .select({ val: count() })
      .from(auditLogs)
      .where(whereClause);

    const total = Number(totalResult?.val || 0);

    const fetchLimit = limit + 1;
    // ARC-082: Deterministic sort with primary key tiebreaker
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(fetchLimit)
      .offset(filters?.cursor ? 0 : offset);

    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
    let nextCursor: string | null = null;
    if (hasNextPage && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      nextCursor = encodeCursor({
        createdAt: lastRow.createdAt,
        id: lastRow.id,
      });
    }

    return {
      items: pageRows.map((r) => this.mapToEntity(r)),
      total,
      nextCursor,
      hasNextPage,
    };
  }

  async findById(id: string): Promise<AuditLogEntity | null> {
    const [row] = await this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, id));

    return row ? this.mapToEntity(row) : null;
  }

  private mapToEntity(row: any): AuditLogEntity {
    return {
      id: row.id,
      actorUserId: row.actorUserId,
      actorRoleCode: row.actorRoleCode,
      action: row.action,
      entityTable: row.entityTable,
      entityId: row.entityId,
      oldValues: row.oldValues,
      newValues: row.newValues,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    };
  }
}

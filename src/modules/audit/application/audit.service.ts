import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogEntity } from '../domain/entities/audit-log.entity';
import {
  AUDIT_LOG_REPOSITORY,
  AuditLogRepository,
  CreateAuditLogData,
} from '../domain/repositories/audit-log.repository';
import { QueryAuditLogDto } from '../presentation/dto/query-audit-log.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  async recordLog(data: CreateAuditLogData): Promise<AuditLogEntity | null> {
    try {
      return await this.auditLogRepo.create(data);
    } catch (error) {
      this.logger.error(
        `Failed to persist audit log for [${data.action}] on [${data.entityTable}]: ${String(error)}`,
      );
      return null;
    }
  }

  async findAll(query: QueryAuditLogDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const { items, total } = await this.auditLogRepo.findAll(limit, offset, {
      entityTable: query.entityTable,
      entityId: query.entityId,
      actorUserId: query.actorUserId,
      action: query.action,
    });

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<AuditLogEntity> {
    const log = await this.auditLogRepo.findById(id);
    if (!log) {
      throw new NotFoundException(`Audit log dengan ID ${id} tidak ditemukan`);
    }
    return log;
  }
}

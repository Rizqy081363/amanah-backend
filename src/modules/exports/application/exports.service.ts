import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  EXPORTS_EXCHANGE,
  ROUTING_KEY_EXPORT_REQUESTED,
} from '../../../common/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '../../../common/rabbitmq/rabbitmq.service';
import { RedisService } from '../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { exportJobs } from '../../../database/schema/export-jobs.schema';
import { ExportStorageService } from '../infrastructure/storage/export-storage.service';
import { CreateExportDto } from '../presentation/dto/create-export.dto';

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly rabbitmqService: RabbitMQService,
    private readonly redisService: RedisService,
    private readonly storageService: ExportStorageService,
  ) {}

  async requestExport(
    dto: CreateExportDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const [existing] = await this.db
        .select()
        .from(exportJobs)
        .where(
          and(
            eq(exportJobs.requestedBy, userId),
            eq(exportJobs.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);

      if (existing) {
        return {
          jobId: existing.id,
          status: existing.status,
          statusUrl: `/api/v1/exports/${existing.id}`,
          isIdempotentReplay: true,
        };
      }
    }

    const [job] = await this.db
      .insert(exportJobs)
      .values({
        requestedBy: userId,
        exportType: dto.exportType.toLowerCase(),
        format: dto.format.toLowerCase(),
        parameters: dto.parameters || {},
        idempotencyKey: idempotencyKey || null,
        status: 'queued',
      })
      .returning();

    await this.rabbitmqService.publish(
      ROUTING_KEY_EXPORT_REQUESTED,
      { jobId: job.id },
      EXPORTS_EXCHANGE,
    );

    return {
      jobId: job.id,
      status: job.status,
      statusUrl: `/api/v1/exports/${job.id}`,
    };
  }

  async getJobStatus(jobId: string, userId: string) {
    const [job] = await this.db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId))
      .limit(1);

    if (!job || job.requestedBy !== userId) {
      throw new NotFoundException(`Export job '${jobId}' not found`);
    }

    let progressInfo: any = null;
    try {
      const client = this.redisService.getClient();
      const rawProgress = await client.hgetall(`export:progress:${jobId}`);
      if (rawProgress && Object.keys(rawProgress).length > 0) {
        progressInfo = rawProgress;
      }
    } catch {
      // Redis optional fallback
    }

    const percent =
      job.status === 'completed'
        ? 100
        : progressInfo?.percent
          ? parseInt(progressInfo.percent, 10)
          : 0;

    return {
      jobId: job.id,
      status: job.status,
      exportType: job.exportType,
      format: job.format,
      totalRows: progressInfo?.total
        ? parseInt(progressInfo.total, 10)
        : job.totalRows,
      processedRows: progressInfo?.processed
        ? parseInt(progressInfo.processed, 10)
        : job.processedRows,
      percent,
      phase: progressInfo?.phase || job.status.toUpperCase(),
      errorMessage: job.errorMessage,
      downloadUrl:
        job.status === 'completed'
          ? `/api/v1/exports/${job.id}/download`
          : null,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    };
  }

  async getDownloadFile(jobId: string, userId: string) {
    const [job] = await this.db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId))
      .limit(1);

    if (!job || job.requestedBy !== userId) {
      throw new NotFoundException(`Export job '${jobId}' not found`);
    }

    if (job.status !== 'completed' || !job.fileId) {
      throw new ConflictException(
        `Job is not ready for download. Current status: ${job.status}`,
      );
    }

    const fileMeta = await this.storageService.getFileMetadata(job.fileId);
    if (!fileMeta || !fileMeta.exists) {
      throw new NotFoundException('Exported physical file not found on storage');
    }

    return {
      filePath: fileMeta.fullPath,
      originalName: fileMeta.originalName,
      mimeType: fileMeta.mimeType,
      byteSize: fileMeta.byteSize,
    };
  }

  async getMyHistory(userId: string) {
    return this.db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.requestedBy, userId))
      .orderBy(desc(exportJobs.createdAt))
      .limit(20);
  }

  async cancelExport(jobId: string, userId: string) {
    const [job] = await this.db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId))
      .limit(1);

    if (!job || job.requestedBy !== userId) {
      throw new NotFoundException(`Export job '${jobId}' not found`);
    }

    if (job.status === 'completed' || job.status === 'failed') {
      throw new ConflictException(
        `Cannot cancel job with terminal status: ${job.status}`,
      );
    }

    await this.db
      .update(exportJobs)
      .set({ status: 'cancelled' })
      .where(eq(exportJobs.id, jobId));

    return { success: true, message: 'Export job successfully cancelled' };
  }
}

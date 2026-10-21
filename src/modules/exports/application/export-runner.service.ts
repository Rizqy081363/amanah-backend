import * as fs from 'node:fs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  NOTIFICATIONS_EXCHANGE,
  ROUTING_KEY_PUSH_PATTERN,
} from '../../../common/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '../../../common/rabbitmq/rabbitmq.service';
import { RedisService } from '../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { exportJobs } from '../../../database/schema/export-jobs.schema';
import { ExportContext } from '../domain/exporter.interface';
import { ExporterRegistry } from '../infrastructure/exporters/exporter.registry';
import { ExportSourceRegistry } from '../infrastructure/sources/source.registry';
import { ExportStorageService } from '../infrastructure/storage/export-storage.service';
import { ProgressReporter } from './progress.reporter';

@Injectable()
export class ExportRunnerService {
  private readonly logger = new Logger(ExportRunnerService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
    private readonly storageService: ExportStorageService,
    private readonly exporterRegistry: ExporterRegistry,
    private readonly sourceRegistry: ExportSourceRegistry,
    private readonly rabbitmqService: RabbitMQService,
  ) {}

  async execute(jobId: string): Promise<void> {
    const [job] = await this.db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, jobId))
      .limit(1);

    if (!job) {
      this.logger.warn(`Export job ${jobId} not found, skipping.`);
      return;
    }

    if (job.status === 'completed' || job.status === 'cancelled') {
      this.logger.log(`Export job ${jobId} already ${job.status}, skipping.`);
      return;
    }

    const nowStr = new Date().toISOString();

    // 1. Mark RUNNING
    await this.db
      .update(exportJobs)
      .set({
        status: 'running',
        startedAt: nowStr,
        heartbeatAt: nowStr,
        attempt: (job.attempt || 0) + 1,
      })
      .where(eq(exportJobs.id, jobId));

    try {
      const source = this.sourceRegistry.get(job.exportType);
      const exporter = this.exporterRegistry.get(job.format);
      const params = (job.parameters as Record<string, any>) || {};

      // 2. Count rows
      const total = await source.count(params, job.requestedBy);
      await this.db
        .update(exportJobs)
        .set({ totalRows: total })
        .where(eq(exportJobs.id, jobId));

      // 3. Prepare storage sink
      const { filePath, sink, storageKey } = this.storageService.getSink(
        job.id,
        exporter.extension,
      );

      const progress = new ProgressReporter(
        this.redisService,
        job.id,
        total,
      );
      await progress.flush('WRITING');

      const ctx: ExportContext = {
        jobId: job.id,
        userId: job.requestedBy,
        exportType: job.exportType,
        format: exporter.format,
        params,
        total,
        isCancelled: async () => {
          const [current] = await this.db
            .select({ status: exportJobs.status })
            .from(exportJobs)
            .where(eq(exportJobs.id, jobId))
            .limit(1);
          return current?.status === 'cancelled';
        },
      };

      // 4. Stream data into file sink
      const { parts, rowCount } = await exporter.run(
        ctx,
        source,
        sink,
        progress,
      );

      // 5. Measure file size & record in files table
      const fileStats = fs.statSync(filePath);
      const originalName = `${job.exportType}-${job.id.slice(0, 8)}.${exporter.extension}`;

      const fileId = await this.storageService.recordFile({
        storageKey,
        originalName,
        mimeType: exporter.contentType,
        byteSize: fileStats.size,
        uploadedBy: job.requestedBy,
      });

      // 6. Mark COMPLETED
      const finishedStr = new Date().toISOString();
      await this.db
        .update(exportJobs)
        .set({
          status: 'completed',
          processedRows: rowCount,
          totalRows: total,
          fileId,
          objectKey: storageKey,
          fileSize: fileStats.size,
          parts,
          finishedAt: finishedStr,
        })
        .where(eq(exportJobs.id, jobId));

      await progress.finish();

      // 7. Announce completion via RabbitMQ to Push Notification Gateway
      const routingKey = ROUTING_KEY_PUSH_PATTERN.replace('*', job.requestedBy);
      await this.rabbitmqService.publish(
        routingKey,
        {
          recipientId: job.requestedBy,
          title: 'Laporan Siap Diunduh',
          body: `Berkas ekspor ${job.exportType} (${exporter.format.toUpperCase()}) telah selesai diproses.`,
          category: 'export',
          priority: 'high',
          data: {
            jobId: job.id,
            exportType: job.exportType,
            format: exporter.format,
            fileId,
            fileName: originalName,
          },
        },
        NOTIFICATIONS_EXCHANGE,
      );

      this.logger.log(
        `Successfully completed export job ${job.id} (${rowCount} rows, ${fileStats.size} bytes).`,
      );
    } catch (err: any) {
      this.logger.error(`Export job ${jobId} failed: ${err.message}`, err.stack);
      await this.db
        .update(exportJobs)
        .set({
          status: 'failed',
          errorMessage: err.message,
          finishedAt: new Date().toISOString(),
        })
        .where(eq(exportJobs.id, jobId));

      const progress = new ProgressReporter(this.redisService, job.id, 0);
      await progress.fail(err.message);
      throw err;
    }
  }
}

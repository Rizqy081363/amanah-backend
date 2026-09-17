import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
  AuditRecordEvent,
} from '../events';
import {
  DEFAULT_OUTBOX_BATCH_SIZE,
  DEFAULT_OUTBOX_POLL_INTERVAL_MS,
} from './outbox.constants';
import { OutboxService } from './outbox.service';
import { OutboxProcessResult } from './outbox.types';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isShuttingDown = false;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.pollIntervalMs =
      this.configService.get<number>('OUTBOX_POLL_INTERVAL_MS') ||
      DEFAULT_OUTBOX_POLL_INTERVAL_MS;
  }

  onModuleInit(): void {
    this.logger.log(
      `Starting OutboxWorker background dispatcher with ${this.pollIntervalMs}ms interval (OPS-144..168).`,
    );
    this.startPolling();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down OutboxWorker gracefully (OPS-162)...');
    this.isShuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Wait for in-flight batch processing to complete (up to 5000ms)
    const start = Date.now();
    while (this.isProcessing && Date.now() - start < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.logger.log('OutboxWorker shutdown complete.');
  }

  private startPolling(): void {
    this.timer = setInterval(async () => {
      if (this.isShuttingDown || this.isProcessing) return;
      try {
        await this.processBatch();
      } catch (err) {
        this.logger.error(`Error during outbox poll cycle: ${String(err)}`);
      }
    }, this.pollIntervalMs);

    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Triggers immediate outbox processing (called right after transaction commit).
   */
  async triggerImmediate(
    batchSize = DEFAULT_OUTBOX_BATCH_SIZE,
  ): Promise<OutboxProcessResult> {
    if (this.isShuttingDown) {
      const metrics = await this.outboxService.getMetrics();
      return {
        processedCount: 0,
        publishedCount: 0,
        failedCount: 0,
        metrics,
      };
    }
    return this.processBatch(batchSize);
  }

  /**
   * Processes a batch of pending outbox events using SKIP LOCKED (OPS-144..168).
   */
  async processBatch(
    batchSize = DEFAULT_OUTBOX_BATCH_SIZE,
  ): Promise<OutboxProcessResult> {
    if (this.isProcessing || this.isShuttingDown) {
      const metrics = await this.outboxService.getMetrics();
      return {
        processedCount: 0,
        publishedCount: 0,
        failedCount: 0,
        metrics,
      };
    }

    this.isProcessing = true;
    let processedCount = 0;
    let publishedCount = 0;
    let failedCount = 0;

    try {
      const events = await this.outboxService.fetchAndClaimBatch(batchSize);
      processedCount = events.length;

      for (const event of events) {
        try {
          const domainEvent = this.deserializeDomainEvent(event);
          // Dispatch to internal asynchronous listeners via EventEmitter2 (ARC-093, OPS-159)
          await this.eventEmitter.emitAsync(event.eventType, domainEvent);

          // Acknowledge upon durable completion (OPS-158)
          await this.outboxService.markPublished(event.id);
          publishedCount++;
        } catch (error: any) {
          failedCount++;
          const errorMessage = String(error?.message || error);
          this.logger.error(
            `Failed to dispatch outbox event ${event.id} (${event.eventType}): ${errorMessage}`,
          );
          await this.outboxService.markFailed(
            event.id,
            errorMessage,
            event.retryCount,
            event.maxRetries,
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }

    const metrics = await this.outboxService.getMetrics();
    return {
      processedCount,
      publishedCount,
      failedCount,
      metrics,
    };
  }

  /**
   * Reconstructs domain event class instances from serialized payload (OPS-150).
   */
  private deserializeDomainEvent(event: {
    eventType: string;
    payload: any;
    traceId: string | null;
  }): any {
    const p = event.payload || {};
    const corrId = p.correlationId || event.traceId || undefined;

    switch (event.eventType) {
      case AppointmentCreatedEvent.EVENT_NAME:
        return new AppointmentCreatedEvent(
          p.appointmentId,
          p.patientId,
          p.poliklinikId,
          p.appointmentDate,
          p.session,
          p.queueNumber,
          p.status,
          corrId,
          p.actor,
        );

      case AppointmentStatusChangedEvent.EVENT_NAME:
        return new AppointmentStatusChangedEvent(
          p.appointmentId,
          p.previousStatus ?? null,
          p.newStatus,
          p.reason,
          corrId,
          p.actor,
        );

      case AuditRecordEvent.EVENT_NAME:
        return new AuditRecordEvent(
          p.action,
          p.entityTable,
          p.entityId,
          p.oldValues,
          p.newValues,
          corrId,
          p.actor,
        );

      default:
        // Generic fallback for custom domain events
        return {
          ...p,
          eventName: event.eventType,
          correlationId: corrId,
        };
    }
  }
}

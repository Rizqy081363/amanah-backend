import { RedisService } from '../../../common/redis/redis.service';
import { IProgressReporter } from '../domain/exporter.interface';

export class ProgressReporter implements IProgressReporter {
  private processed = 0;
  private lastFlush = 0;

  constructor(
    private readonly redisService: RedisService,
    private readonly jobId: string,
    private readonly total: number,
  ) {}

  async advance(count: number): Promise<void> {
    this.processed += count;
    const now = Date.now();
    if (now - this.lastFlush >= 500) {
      await this.flush('WRITING');
    }
  }

  async flush(phase: string): Promise<void> {
    this.lastFlush = Date.now();
    const percent =
      this.total > 0
        ? Math.min(99, Math.floor((this.processed / this.total) * 100))
        : 0;

    const client = this.redisService.getClient();
    const key = `export:progress:${this.jobId}`;

    await client.hset(key, {
      jobId: this.jobId,
      processed: String(this.processed),
      total: String(this.total),
      percent: String(percent),
      phase,
      updatedAt: new Date().toISOString(),
    });

    await client.expire(key, 86400); // 24 hours retention
  }

  async finish(): Promise<void> {
    const client = this.redisService.getClient();
    const key = `export:progress:${this.jobId}`;

    await client.hset(key, {
      jobId: this.jobId,
      processed: String(this.processed),
      total: String(this.total),
      percent: '100',
      phase: 'DONE',
      updatedAt: new Date().toISOString(),
    });

    await client.expire(key, 86400);
  }

  async fail(errorMessage: string): Promise<void> {
    const client = this.redisService.getClient();
    const key = `export:progress:${this.jobId}`;

    await client.hset(key, {
      jobId: this.jobId,
      phase: 'FAILED',
      errorMessage,
      updatedAt: new Date().toISOString(),
    });

    await client.expire(key, 86400);
  }
}

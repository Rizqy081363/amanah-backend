import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { RedisService } from '../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../database/drizzle/drizzle.provider';

type DependencyName = 'database' | 'redis';
type DependencyState = 'up' | 'down';

export type DependencyHealth = {
  name: DependencyName;
  status: DependencyState;
  detail?: string;
};

export type ReadinessHealth = {
  status: DependencyState;
  dependencies: DependencyHealth[];
};

@Injectable()
export class HealthService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly database: DrizzleDatabase,
    private readonly redisService: RedisService,
  ) {}

  getLiveness() {
    return { status: 'up' as const };
  }

  async getReadiness(): Promise<ReadinessHealth> {
    const dependencies = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const isReady = dependencies.every(
      (dependency) => dependency.status === 'up',
    );

    return {
      status: isReady ? 'up' : 'down',
      dependencies,
    };
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    try {
      await this.database.execute(sql`select 1`);
      return { name: 'database', status: 'up' };
    } catch (error) {
      return {
        name: 'database',
        status: 'down',
        detail: this.getErrorMessage(error),
      };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    try {
      await this.redisService.ping();
      return { name: 'redis', status: 'up' };
    } catch (error) {
      return {
        name: 'redis',
        status: 'down',
        detail: this.getErrorMessage(error),
      };
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

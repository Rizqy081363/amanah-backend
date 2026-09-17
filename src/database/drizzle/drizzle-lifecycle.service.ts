import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { POSTGRES_POOL } from './drizzle.constants';

@Injectable()
export class DrizzleLifecycleService implements OnModuleDestroy {
  private readonly logger = new Logger(DrizzleLifecycleService.name);

  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.log('PostgreSQL pool closed.');
  }
}

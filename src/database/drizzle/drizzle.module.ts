import { Global, Module } from '@nestjs/common';
import { DRIZZLE_SOURCE, POSTGRES_POOL } from './drizzle.constants';
import { drizzleProvider, postgresPoolProvider } from './drizzle.provider';
import { DrizzleLifecycleService } from './drizzle-lifecycle.service';

@Global()
@Module({
  providers: [postgresPoolProvider, drizzleProvider, DrizzleLifecycleService],
  exports: [POSTGRES_POOL, DRIZZLE_SOURCE],
})
export class DrizzleModule {}

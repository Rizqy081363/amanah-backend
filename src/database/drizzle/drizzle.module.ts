import { Global, Module } from '@nestjs/common';
import { DRIZZLE_SOURCE } from './drizzle.constants';
import { drizzleProvider, postgresPoolProvider } from './drizzle.provider';
import { DrizzleLifecycleService } from './drizzle-lifecycle.service';

@Global()
@Module({
  providers: [postgresPoolProvider, drizzleProvider, DrizzleLifecycleService],
  exports: [DRIZZLE_SOURCE],
})
export class DrizzleModule {}

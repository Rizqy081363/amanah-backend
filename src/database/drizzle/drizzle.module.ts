import { Global, Module } from '@nestjs/common';
import { drizzleProvider } from './drizzle.provider';
import { DRIZZLE_SOURCE } from './drizzle.constants';

@Global()
@Module({
  providers: [drizzleProvider],
  exports: [DRIZZLE_SOURCE],
})
export class DrizzleModule {}

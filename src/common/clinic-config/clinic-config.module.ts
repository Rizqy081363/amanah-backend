import { Global, Module } from '@nestjs/common';
import { DrizzleModule } from '../../database/drizzle/drizzle.module';
import { ClinicConfigService } from './clinic-config.service';

@Global()
@Module({
  imports: [DrizzleModule],
  providers: [ClinicConfigService],
  exports: [ClinicConfigService],
})
export class ClinicConfigModule {}

import { Global, Module } from '@nestjs/common';
import { ClinicTimeService } from './clinic-time.service';

@Global()
@Module({
  providers: [ClinicTimeService],
  exports: [ClinicTimeService],
})
export class ClinicTimeModule {}

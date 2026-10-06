import { Global, Module } from '@nestjs/common';
import { ClinicTimeController } from './clinic-time.controller';
import { ClinicTimeService } from './clinic-time.service';
import { Clock, SystemClock } from './clock';
import { TimeContractGuard } from './time-contract.guard';

@Global()
@Module({
  controllers: [ClinicTimeController],
  providers: [
    {
      provide: Clock,
      useClass: SystemClock,
    },
    ClinicTimeService,
    TimeContractGuard,
  ],
  exports: [Clock, ClinicTimeService],
})
export class ClinicTimeModule {}

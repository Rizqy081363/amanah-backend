import { Module } from '@nestjs/common';
import { DailyLeavePayrollScheduler } from './application/scheduler/daily-leave-payroll.scheduler';
import { DailyLeavePayrollService } from './application/services/daily-leave-payroll.service';
import { PAYROLL_REPOSITORY } from './domain/repositories/payroll.repository';
import { PayrollDrizzleRepository } from './infrastructure/drizzle/payroll.drizzle-repository';
import { PayrollController } from './presentation/payroll.controller';

@Module({
  controllers: [PayrollController],
  providers: [
    {
      provide: PAYROLL_REPOSITORY,
      useClass: PayrollDrizzleRepository,
    },
    DailyLeavePayrollService,
    DailyLeavePayrollScheduler,
  ],
  exports: [PAYROLL_REPOSITORY, DailyLeavePayrollService],
})
export class PayrollModule {}

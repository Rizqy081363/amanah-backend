import { Module } from '@nestjs/common';
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
  ],
  exports: [PAYROLL_REPOSITORY],
})
export class PayrollModule {}

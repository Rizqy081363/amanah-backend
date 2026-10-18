import { Module } from '@nestjs/common';
import { WORK_POLICY_REPOSITORY } from './domain/repositories/work-policy.repository';
import { WorkPolicyDrizzleRepository } from './infrastructure/drizzle/work-policy.drizzle-repository';
import { WorkPoliciesController } from './presentation/work-policies.controller';

@Module({
  controllers: [WorkPoliciesController],
  providers: [
    {
      provide: WORK_POLICY_REPOSITORY,
      useClass: WorkPolicyDrizzleRepository,
    },
  ],
  exports: [WORK_POLICY_REPOSITORY],
})
export class WorkPoliciesModule {}

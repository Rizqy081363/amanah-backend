import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClinicPolicyAnnouncementService } from './application/services/clinic-policy-announcement.service';
import { WORK_POLICY_REPOSITORY } from './domain/repositories/work-policy.repository';
import { WorkPolicyDrizzleRepository } from './infrastructure/drizzle/work-policy.drizzle-repository';
import { WorkPoliciesController } from './presentation/work-policies.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [WorkPoliciesController],
  providers: [
    ClinicPolicyAnnouncementService,
    {
      provide: WORK_POLICY_REPOSITORY,
      useClass: WorkPolicyDrizzleRepository,
    },
  ],
  exports: [WORK_POLICY_REPOSITORY, ClinicPolicyAnnouncementService],
})
export class WorkPoliciesModule {}

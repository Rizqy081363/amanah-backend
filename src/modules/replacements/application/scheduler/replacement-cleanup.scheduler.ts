import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { ISchedulerPort, SCHEDULER_PORT } from '../../../../common/scheduler';
import {
  REPLACEMENT_REPOSITORY,
  ReplacementRepository,
} from '../../domain/repositories/replacement.repository';

@Injectable()
export class ReplacementCleanupScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReplacementCleanupScheduler.name);

  constructor(
    @Inject(SCHEDULER_PORT)
    private readonly scheduler: ISchedulerPort,
    @Inject(REPLACEMENT_REPOSITORY)
    private readonly replacementRepo: ReplacementRepository,
    private readonly clinicConfigService: ClinicConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log(
        'Registering dynamic replacement cleanup job with agnostic SchedulerPort...',
      );

      let cronExpr = '0 * * * *'; // Default hourly
      try {
        cronExpr = await this.clinicConfigService.getString(
          'replacement.cleanup_cron_expression',
        );
      } catch {
        // Fallback to default hourly
      }

      let leadHours = 2;
      try {
        leadHours = await this.clinicConfigService.getNumber(
          'replacement.auto_expire_hours_before_shift',
        );
      } catch {
        // Fallback to 2 hours
      }

      await this.scheduler.registerDynamicJob({
        jobId: 'replacement_cleanup',
        description:
          'Pembersihan otomatis peluang pengganti yang telah kedaluwarsa',
        cronExpression: cronExpr,
        distributedLock: true,
        handler: async () => {
          this.logger.log(
            `[ReplacementCleanup] Running scheduled cleanup (leadHours=${leadHours})...`,
          );
          const cleanedCount =
            await this.replacementRepo.cleanupExpiredOpportunities(leadHours);
          if (cleanedCount > 0) {
            this.logger.log(
              `[ReplacementCleanup] Cleaned up ${cleanedCount} expired replacement opportunities.`,
            );
          }
        },
      });

      this.logger.log(
        `Replacement cleanup dynamic job registered successfully (cron="${cronExpr}").`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register replacement cleanup scheduler job: ${String(err)}`,
      );
    }
  }
}

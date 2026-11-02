import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ISchedulerPort, SCHEDULER_PORT } from '../../../../common/scheduler';
import { AppointmentProposalService } from '../services/appointment-proposal.service';

@Injectable()
export class AppointmentProposalExpiryScheduler
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(
    AppointmentProposalExpiryScheduler.name,
  );

  constructor(
    @Inject(SCHEDULER_PORT)
    private readonly scheduler: ISchedulerPort,
    private readonly proposalService: AppointmentProposalService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log(
        'Registering dynamic appointment proposal expiry sweeper job with SchedulerPort...',
      );

      await this.scheduler.registerDynamicJob({
        jobId: 'appointment_proposal_expiry_sweeper',
        description:
          'Evaluasi berkala pengajuan reschedule/pembatalan janji temu yang melewati batas kedaluwarsa waktu sesi asli',
        configKey: 'proposal.sweeper_cron_expression',
        cronExpression: '*/5 * * * *',
        distributedLock: true,
        lockMode: 'run',
        lockTtlSeconds: 120,
        handler: async () => {
          await this.proposalService.sweepExpiredProposals();
        },
      });

      this.logger.log(
        'Appointment proposal expiry dynamic scheduler registered successfully.',
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to register appointment proposal expiry dynamic scheduler: ${error.message}`,
      );
    }
  }
}

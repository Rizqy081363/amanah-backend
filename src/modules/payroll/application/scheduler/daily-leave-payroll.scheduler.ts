import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  ISchedulerPort,
  SCHEDULER_PORT,
} from '../../../../common/scheduler';
import { DailyLeavePayrollService } from '../services/daily-leave-payroll.service';

@Injectable()
export class DailyLeavePayrollScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(DailyLeavePayrollScheduler.name);

  constructor(
    @Inject(SCHEDULER_PORT)
    private readonly scheduler: ISchedulerPort,
    private readonly dailyLeavePayrollService: DailyLeavePayrollService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log(
        'Registering dynamic daily leave payroll job with agnostic SchedulerPort...',
      );

      await this.scheduler.registerDynamicJob({
        jobId: 'daily_leave_payroll',
        description:
          'Rekonsiliasi dinamis cuti dan payroll berbasis akhir shift staf',
        cronExpression: '0 * * * *',
        distributedLock: true,
        handler: async () => {
          await this.dailyLeavePayrollService.processDailyLeave();
        },
      });

      this.logger.log('Daily leave payroll dynamic job registered successfully.');
    } catch (err) {
      this.logger.error(
        `Failed to register daily leave payroll scheduler job: ${String(err)}`,
      );
    }
  }
}

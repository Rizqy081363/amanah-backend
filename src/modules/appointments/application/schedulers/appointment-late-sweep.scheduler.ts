import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ISchedulerPort, SCHEDULER_PORT } from '../../../../common/scheduler';
import { SweepLateAppointmentsUseCase } from '../use-cases/sweep-late-appointments.use-case';

@Injectable()
export class AppointmentLateSweepScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppointmentLateSweepScheduler.name);

  constructor(
    @Inject(SCHEDULER_PORT)
    private readonly scheduler: ISchedulerPort,
    private readonly sweepLateAppointmentsUseCase: SweepLateAppointmentsUseCase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log(
        'Registering dynamic appointment late sweeper job with SchedulerPort...',
      );

      await this.scheduler.registerDynamicJob({
        jobId: 'appointment_late_sweeper',
        description:
          'Evaluasi berkala otomatis keterlambatan janji temu pasien yang melewati batas toleransi atau berganti hari (24 jam)',
        configKey: 'queue.late_sweeper_cron_expression',
        cronExpression: '*/2 * * * *',
        distributedLock: true,
        lockMode: 'run',
        lockTtlSeconds: 100,
        handler: async () => {
          await this.sweepLateAppointmentsUseCase.execute();
        },
      });

      this.logger.log(
        'Appointment late sweeper dynamic scheduler registered successfully (interval: every 2 minutes).',
      );
    } catch (err) {
      this.logger.error(
        `Failed to register appointment late sweeper scheduler job: ${String(err)}`,
      );
    }
  }
}

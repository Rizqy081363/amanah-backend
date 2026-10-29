import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ISchedulerPort, SCHEDULER_PORT } from '../../../../common/scheduler';
import { AppointmentCheckInReminderService } from '../services/appointment-check-in-reminder.service';

@Injectable()
export class AppointmentCheckInReminderScheduler
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(AppointmentCheckInReminderScheduler.name);

  constructor(
    @Inject(SCHEDULER_PORT)
    private readonly scheduler: ISchedulerPort,
    private readonly reminderService: AppointmentCheckInReminderService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log(
        'Registering dynamic appointment check-in reminder job with SchedulerPort...',
      );

      await this.scheduler.registerDynamicJob({
        jobId: 'appointment_check_in_reminder',
        description:
          'Evaluasi berkala jendela waktu check-in janji temu pasien dan pengumuman staf',
        cronExpression: '* * * * *',
        distributedLock: true,
        lockMode: 'run',
        lockTtlSeconds: 50,
        handler: async () => {
          await this.reminderService.evaluateAndDispatchReminders();
        },
      });

      this.logger.log(
        'Appointment check-in reminder dynamic scheduler registered successfully (interval: every 1 minute).',
      );
    } catch (err) {
      this.logger.error(
        `Failed to register appointment check-in reminder scheduler job: ${String(err)}`,
      );
    }
  }
}

import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ISchedulerPort, SCHEDULER_PORT } from '../../../../common/scheduler';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { ProcessShiftEndAbsenceUseCase } from '../use-cases/process-shift-end-absence.use-case';

@Injectable()
export class ShiftEndAttendanceScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ShiftEndAttendanceScheduler.name);

  constructor(
    @Inject(SCHEDULER_PORT)
    private readonly scheduler: ISchedulerPort,
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly processShiftEndAbsenceUseCase: ProcessShiftEndAbsenceUseCase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      this.logger.log(
        'Registering deterministic shift-end attendance jobs with agnostic SchedulerPort...',
      );

      // 1. Fetch active session definitions to dynamically derive execution boundaries
      const activeSessions = await this.repo.findAllActiveSessions();
      const distinctEndTimes = new Set<string>();

      for (const s of activeSessions) {
        if (s.defaultEndsAt) {
          distinctEndTimes.add(s.defaultEndsAt.trim());
        }
      }

      // 2. Register dynamic cron job for each unique shift end boundary
      for (const endTimeStr of distinctEndTimes) {
        const parts = endTimeStr.split(':');
        let hour = parseInt(parts[0] || '0', 10);
        const minute = parseInt(parts[1] || '0', 10);
        if (hour >= 24) {
          hour = 0;
        }

        const cronExpr = `0 ${minute} ${hour} * * *`;
        const jobId = `shift_end_${String(hour).padStart(2, '0')}_${String(minute).padStart(2, '0')}`;

        await this.scheduler.registerDynamicJob({
          jobId,
          description: `Event-driven evaluasi absensi shift selesai jam ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          cronExpression: cronExpr,
          distributedLock: true,
          handler: async () => {
            await this.processShiftEndAbsenceUseCase.execute();
          },
        });

        this.logger.log(
          `Registered dynamic shift-end job "${jobId}" with cron="${cronExpr}"`,
        );
      }

      // 3. Register periodic safety reconciliation sweep job (hourly)
      await this.scheduler.registerDynamicJob({
        jobId: 'shift_end_attendance_safety_sweep',
        description:
          'Safety sweep rekonsiliasi deterministik presensi akhir shift staf',
        cronExpression: '0 * * * *',
        distributedLock: true,
        handler: async () => {
          await this.processShiftEndAbsenceUseCase.execute();
        },
      });

      this.logger.log(
        'All deterministic shift-end attendance jobs registered successfully.',
      );
    } catch (err) {
      this.logger.error(
        `Failed to register shift-end attendance scheduler jobs: ${String(err)}`,
      );
    }
  }
}

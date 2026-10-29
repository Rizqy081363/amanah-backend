import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ClinicConfigService } from '../clinic-config/clinic-config.service';
import { RedisService } from '../redis/redis.service';
import { ISchedulerPort } from './scheduler-port.interface';
import { RegisterJobOptions, ScheduledJobInfo } from './scheduler.types';

@Injectable()
export class CronSchedulerAdapter
  implements ISchedulerPort, OnApplicationShutdown
{
  private readonly logger = new Logger(CronSchedulerAdapter.name);
  private readonly jobRegistryMap = new Map<string, RegisterJobOptions>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly clinicConfigService: ClinicConfigService,
    @Optional()
    private readonly redisService?: RedisService,
  ) {}

  onApplicationShutdown(): void {
    for (const [jobId] of this.jobRegistryMap) {
      this.cancelJob(jobId);
    }
    this.jobRegistryMap.clear();
  }

  async registerDynamicJob(options: RegisterJobOptions): Promise<void> {
    if (this.hasJob(options.jobId)) {
      this.logger.warn(
        `Job "${options.jobId}" already registered. Rescheduling.`,
      );
      this.cancelJob(options.jobId);
    }

    let cronExpr = options.cronExpression;
    if (!cronExpr && options.configKey) {
      try {
        const timeVal = await this.clinicConfigService.getString(
          options.configKey,
        );
        cronExpr = this.convertTimeToCron(timeVal);
      } catch {
        const fallback = options.defaultTime || '21:00';
        cronExpr = this.convertTimeToCron(fallback);
      }
    }

    if (!cronExpr) {
      cronExpr = this.convertTimeToCron(options.defaultTime || '21:00');
    }

    let tz = options.timezone;
    if (!tz) {
      try {
        tz = await this.clinicConfigService.getTimezone();
      } catch {
        tz = 'Asia/Jakarta';
      }
    }

    this.jobRegistryMap.set(options.jobId, {
      ...options,
      cronExpression: cronExpr,
      timezone: tz,
    });

    const wrappedHandler = async () => {
      const startTime = Date.now();
      const todayStr = new Date().toISOString().split('T')[0];

      if (options.distributedLock && this.redisService) {
        const isRunMode = options.lockMode === 'run';
        const lockKey = isRunMode
          ? `cron_lock:${options.jobId}:run`
          : `cron_lock:${options.jobId}:${todayStr}`;
        const defaultTtl = isRunMode ? 50 : 7200;

        try {
          const isLocked = await this.redisService.get(lockKey);
          if (isLocked) {
            this.logger.log(
              `[Scheduler] Job "${options.jobId}" skipped: already executing or executed by another instance.`,
            );
            return;
          }
          await this.redisService.set(
            lockKey,
            'locked',
            options.lockTtlSeconds || defaultTtl,
          );
        } catch (lockErr) {
          this.logger.warn(
            `[Scheduler] Redis lock failed for "${options.jobId}", proceeding with local execution: ${String(lockErr)}`,
          );
        }
      }

      try {
        this.logger.log(
          `[Scheduler] Executing scheduled job: "${options.jobId}" (${options.description || 'No description'})`,
        );
        await options.handler();
        const duration = Date.now() - startTime;
        this.logger.log(
          `[Scheduler] Job "${options.jobId}" completed successfully in ${duration}ms.`,
        );
      } catch (err) {
        this.logger.error(
          `[Scheduler] Job "${options.jobId}" encountered an error: ${String(err)}`,
          (err as Error)?.stack,
        );
      }
    };

    const cronJob = new CronJob(cronExpr, wrappedHandler, null, true, tz);
    this.schedulerRegistry.addCronJob(options.jobId, cronJob);
    cronJob.start();

    this.logger.log(
      `[Scheduler] Dynamic job "${options.jobId}" registered successfully (cron="${cronExpr}", tz="${tz}").`,
    );
  }

  async rescheduleJob(
    jobId: string,
    cronExpression: string,
  ): Promise<boolean> {
    const existing = this.jobRegistryMap.get(jobId);
    if (!existing) {
      this.logger.warn(`Cannot reschedule non-existent job "${jobId}".`);
      return false;
    }

    this.cancelJob(jobId);
    await this.registerDynamicJob({
      ...existing,
      cronExpression,
    });
    return true;
  }

  async triggerJob(jobId: string): Promise<void> {
    const registered = this.jobRegistryMap.get(jobId);
    if (!registered) {
      throw new Error(`Job "${jobId}" is not registered in the scheduler.`);
    }

    this.logger.log(`[Scheduler] Manually triggering job "${jobId}"...`);
    await registered.handler();
  }

  cancelJob(jobId: string): boolean {
    if (this.hasJob(jobId)) {
      try {
        const job = this.schedulerRegistry.getCronJob(jobId);
        job.stop();
        this.schedulerRegistry.deleteCronJob(jobId);
        this.jobRegistryMap.delete(jobId);
        return true;
      } catch (err) {
        this.logger.warn(`Error cancelling job "${jobId}": ${String(err)}`);
      }
    }
    return false;
  }

  hasJob(jobId: string): boolean {
    return this.jobRegistryMap.has(jobId);
  }

  listJobs(): ScheduledJobInfo[] {
    const result: ScheduledJobInfo[] = [];
    for (const [jobId, opt] of this.jobRegistryMap) {
      let isActive = false;
      let nextExec: string | undefined;
      try {
        const cron = this.schedulerRegistry.getCronJob(jobId);
        isActive = (cron as any).running === true;
        const nextDate = cron.nextDate();
        if (nextDate) {
          nextExec = nextDate.toISO() ?? undefined;
        }
      } catch {
        // ignore
      }

      result.push({
        jobId,
        description: opt.description,
        cronExpression: opt.cronExpression || '',
        timezone: opt.timezone || 'Asia/Jakarta',
        isActive,
        nextExecutionAt: nextExec,
      });
    }
    return result;
  }

  private convertTimeToCron(timeString: string): string {
    const parts = timeString.trim().split(':');
    const hour = parts[0] ? Number(parts[0]) : 21;
    const minute = parts[1] ? Number(parts[1]) : 0;
    return `0 ${minute} ${hour} * * *`;
  }
}

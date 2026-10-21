import { RegisterJobOptions, ScheduledJobInfo } from './scheduler.types';

export interface ISchedulerPort {
  registerDynamicJob(options: RegisterJobOptions): Promise<void>;
  rescheduleJob(jobId: string, cronExpression: string): Promise<boolean>;
  triggerJob(jobId: string): Promise<void>;
  cancelJob(jobId: string): boolean;
  hasJob(jobId: string): boolean;
  listJobs(): ScheduledJobInfo[];
}

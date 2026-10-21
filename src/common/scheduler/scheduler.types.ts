export type ScheduledTaskHandler = () => Promise<void> | void;

export interface RegisterJobOptions {
  jobId: string;
  description?: string;
  cronExpression?: string;
  configKey?: string;
  defaultTime?: string;
  timezone?: string;
  handler: ScheduledTaskHandler;
  enabled?: boolean;
  distributedLock?: boolean;
  lockTtlSeconds?: number;
}

export interface ScheduledJobInfo {
  jobId: string;
  description?: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  lastExecutionAt?: string;
  nextExecutionAt?: string;
}

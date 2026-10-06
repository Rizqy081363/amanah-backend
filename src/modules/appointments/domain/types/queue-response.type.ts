import { BusinessDate } from '../../../../common/time/clinic-time.service';

export type QueueResponseEnvelope<T> = {
  businessDate: BusinessDate;
  clinicTimezone: string;
  generatedAt: string;
  items: T;
};

import { OperatingDayEntity } from '../entities/operating-day.entity';

export interface UpdateOperatingDayItem {
  dow: number;
  isActive: boolean;
}

export interface OperatingDaysRepository {
  findAll(): Promise<OperatingDayEntity[]>;
  findByDow(dow: number): Promise<OperatingDayEntity | null>;
  batchUpdateStatus(items: UpdateOperatingDayItem[]): Promise<void>;
}

export const OPERATING_DAYS_REPOSITORY = Symbol('OPERATING_DAYS_REPOSITORY');

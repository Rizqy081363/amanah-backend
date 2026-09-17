import { ScheduleEntity } from '../entities/schedule.entity';

export const SCHEDULE_REPOSITORY = 'SCHEDULE_REPOSITORY';

export interface ScheduleRepository {
  create(
    data: Omit<ScheduleEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ScheduleEntity>;
  findById(id: string): Promise<ScheduleEntity | null>;
  findAll(
    limit?: number,
    offset?: number,
    filters?: {
      poliklinikId?: string;
      staffId?: string;
      date?: string;
    },
  ): Promise<ScheduleEntity[]>;
  findByStaffId(staffId: string): Promise<ScheduleEntity[]>;
  findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]>;
  update(
    id: string,
    data: Partial<ScheduleEntity>,
  ): Promise<ScheduleEntity | null>;
  toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null>;
  delete(id: string): Promise<boolean>;
}

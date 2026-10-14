import { StaffRosterEntity } from '../entities/staff-roster.entity';

export const STAFF_ROSTER_REPOSITORY = 'STAFF_ROSTER_REPOSITORY';

export interface StaffRosterRepository {
  findByStaffProfileId(staffProfileId: string): Promise<StaffRosterEntity[]>;
  assign(data: {
    staffProfileId: string;
    sessionId: string;
    dow: number;
    notes?: string;
  }): Promise<StaffRosterEntity>;
  bulkReplace(
    staffProfileId: string,
    items: Array<{ sessionId: string; dow: number; notes?: string }>,
  ): Promise<StaffRosterEntity[]>;
  remove(id: string): Promise<boolean>;
  removeByProfileSessionDow(
    staffProfileId: string,
    sessionId: string,
    dow: number,
  ): Promise<boolean>;
  deleteByStaffProfileId(staffProfileId: string): Promise<number>;
}

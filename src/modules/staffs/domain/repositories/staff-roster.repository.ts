import { StaffRosterEntity } from '../entities/staff-roster.entity';

export const STAFF_ROSTER_REPOSITORY = 'STAFF_ROSTER_REPOSITORY';

export abstract class StaffRosterRepository {
  abstract findByStaffProfileId(
    staffProfileId: string,
  ): Promise<StaffRosterEntity[]>;
  abstract assign(data: {
    staffProfileId: string;
    sessionId: string;
    dow: number;
    notes?: string;
  }): Promise<StaffRosterEntity>;
  abstract bulkReplace(
    staffProfileId: string,
    items: Array<{ sessionId: string; dow: number; notes?: string }>,
  ): Promise<StaffRosterEntity[]>;
  abstract remove(id: string): Promise<boolean>;
  abstract removeByProfileSessionDow(
    staffProfileId: string,
    sessionId: string,
    dow: number,
  ): Promise<boolean>;
  abstract deleteByStaffProfileId(staffProfileId: string): Promise<number>;
}

export class StaffRosterEntity {
  id: string;
  staffProfileId: string;
  sessionId: string;
  dow: number;
  isActive: boolean;
  notes?: string | null;
  isOverride?: boolean;
  createdAt: Date;
  updatedAt: Date;
  session?: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
  };
  day?: {
    dow: number;
    code: string;
    nameId: string;
    nameEn: string;
  };
}

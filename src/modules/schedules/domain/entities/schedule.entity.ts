export class ScheduleEntity {
  id: string;
  staffId: string;
  dayOfWeek?: number | null;
  specificDate?: string | null;
  session: 'PAGI' | 'SIANG' | 'MALAM';
  isAvailable: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

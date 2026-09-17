export class ScheduleEntity {
  id: string;
  staffId: string;
  staffName?: string;
  profession?: string;
  poliklinikId?: string | null;
  dayOfWeek?: number | null;
  specificDate?: string | null;
  session: 'PAGI' | 'SIANG' | 'MALAM';
  startTime?: string | null;
  endTime?: string | null;
  capacity?: number;
  availableSlots?: number;
  isAvailable: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PayrollEntryEntity {
  id: string;
  payrollPeriodId: string;
  staffProfileId: string;
  practitionerId?: string | null;
  entryType:
    | 'base_scheduled'
    | 'leave_deduction'
    | 'replacement_addition'
    | 'overtime_addition';
  sourceType:
    | 'roster'
    | 'leave_request'
    | 'replacement_claim'
    | 'attendance'
    | 'manual';
  sourceId?: string | null;
  quantityHours: number;
  hourlyRate: number;
  amount: number;
  description?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  isEarlyDeparture?: boolean;
  notes?: string | null;
  createdAt: Date;
}

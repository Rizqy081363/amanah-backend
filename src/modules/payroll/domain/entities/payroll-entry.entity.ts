import {
  PayrollEntryType,
  PayrollSourceType,
} from '../constants/payroll.constants';

export class PayrollEntryEntity {
  id: string;
  payrollPeriodId: string;
  staffProfileId: string;
  practitionerId?: string | null;
  entryType: PayrollEntryType;
  sourceType: PayrollSourceType;
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

import { PayrollEntryEntity } from '../entities/payroll-entry.entity';
import { PayrollPeriodEntity } from '../entities/payroll-period.entity';

export const PAYROLL_REPOSITORY = 'PAYROLL_REPOSITORY';

export interface PayrollSummary {
  staffId: string;
  staffCode?: string;
  fullName: string;
  staffType: string;
  positionTitle?: string;
  departmentName?: string;
  practitionerId?: string | null;
  periodId?: string;
  periodName?: string;
  periodStart?: string;
  periodEnd?: string;
  periodStatus?: string;
  monthLabel?: string;
  calculatedAt?: Date | null;
  baseHours: number;
  deductionHours: number;
  additionHours: number;
  baseEarnings: number;
  grossEarnings: number;
  leaveDeductions: number;
  replacementAdditions: number;
  netPayroll: number;
  entries: PayrollEntryEntity[];
}

export interface RecordAttendanceShiftInput {
  attendanceRecordId: string;
  staffProfileId: string;
  practitionerId?: string | null;
  attendanceDate: string;
  validatedDurationHours: number;
  isEarlyDeparture?: boolean;
  isReplacement?: boolean;
}

export interface MonthlyPayrollGroup {
  periodId: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  periodStatus: string;
  monthLabel: string;
  totalNet: number;
  totalGross: number;
  totalDeductions: number;
  totalHours: number;
  entries: PayrollEntryEntity[];
}

export interface PayrollFilterOptions {
  categories: Array<{ id: string; label: string }>;
  periods: Array<{
    id: string;
    name: string;
    status: string;
    periodStart: string;
    periodEnd: string;
  }>;
  statuses: Array<{ id: string; label: string }>;
}

export interface PayrollRepository {
  findPeriods(): Promise<PayrollPeriodEntity[]>;
  findPeriodById(id: string): Promise<PayrollPeriodEntity | null>;
  findPeriodWithSummaries(id: string): Promise<{
    period: PayrollPeriodEntity;
    summaries: PayrollSummary[];
  } | null>;
  calculatePeriod(
    periodStart: string,
    periodEnd: string,
    periodName: string,
    calculatedBy: string,
  ): Promise<{
    period: PayrollPeriodEntity;
    summaries: PayrollSummary[];
  }>;
  getStaffPayroll(
    staffId: string,
    periodId?: string,
  ): Promise<PayrollSummary | null>;
  getStaffPayrollHistory(staffId: string): Promise<MonthlyPayrollGroup[]>;
  finalizePeriod(id: string, finalizedBy: string): Promise<PayrollPeriodEntity>;
  recordAttendanceShift(
    input: RecordAttendanceShiftInput,
  ): Promise<PayrollEntryEntity>;
  getPayrollFilterOptions(): Promise<PayrollFilterOptions>;
}

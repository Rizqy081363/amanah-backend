import { PayrollEntryEntity } from '../entities/payroll-entry.entity';
import { PayrollPeriodEntity } from '../entities/payroll-period.entity';

export const PAYROLL_REPOSITORY = 'PAYROLL_REPOSITORY';

export interface PayrollSummary {
  staffId: string;
  fullName: string;
  staffType: string;
  positionTitle?: string;
  practitionerId?: string | null;
  baseHours: number;
  baseEarnings: number;
  leaveDeductions: number;
  replacementAdditions: number;
  netPayroll: number;
  entries: PayrollEntryEntity[];
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
  finalizePeriod(
    id: string,
    finalizedBy: string,
  ): Promise<PayrollPeriodEntity>;
}

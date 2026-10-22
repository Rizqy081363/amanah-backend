export interface ReportSummaryItem {
  componentCode: string;
  componentLabel: string;
  category: 'earning' | 'deduction' | 'adjustment' | 'info';
  quantityHours: number;
  rate: number;
  amount: number;
}

export interface ReportTotals {
  grossEarnings: number;
  totalDeductions: number;
  totalAdjustments: number;
  netPayroll: number;
  totalHours: number;
}

export interface DailyMatrixItem {
  date: string;
  dayName: string;
  shiftHours: number;
  replacementHours: number;
  leaveHours: number;
  totalAmount: number;
}

export interface LeaveDeductionItem {
  leaveRequestId: string;
  requestTypeLabel: string;
  dateRange: string;
  durationDays: number;
  hoursPerDay: number;
  hourlyRate: number;
  dailyDeduction: number;
  totalDeduction: number;
  reason: string;
}

export interface OvertimeAdditionItem {
  attendanceId: string;
  categoryLabel: string;
  date: string;
  dayName: string;
  hours: number;
  hourlyRate: number;
  totalAmount: number;
  notes?: string;
}

export interface PayrollReportAggregation {
  staffCode: string;
  staffName: string;
  positionTitle?: string;
  departmentName?: string;
  periodName: string;
  periodMonth: string;
  periodYear: number;
  periodStart: string;
  periodEnd: string;
  components: ReportSummaryItem[];
  totals: ReportTotals;
  dailyMatrix: DailyMatrixItem[];
  leaveDeductionsList?: LeaveDeductionItem[];
  overtimeAdditionsList?: OvertimeAdditionItem[];
}

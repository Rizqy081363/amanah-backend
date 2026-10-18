export class PayrollPeriodEntity {
  id: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'calculated' | 'finalized';
  totalPayout: number;
  calculatedAt?: Date | null;
  calculatedBy?: string | null;
  ruleVersion?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CompensationRateEntity {
  id: string;
  category: 'doctor' | 'midwife' | 'worker';
  hourlyRate: number;
  overtimeHourlyRate: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

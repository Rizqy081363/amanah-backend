export class CompensationRateEntity {
  id: string;
  roleId: string;
  roleCode?: string | null;
  roleName?: string | null;
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

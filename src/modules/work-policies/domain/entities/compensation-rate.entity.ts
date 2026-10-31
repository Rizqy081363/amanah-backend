export class CompensationRateEntity {
  id: string;
  roleId: string;
  roleCode?: string | null;
  roleName?: string | null;
  roleTier?: string | null;
  roleIsClinical?: boolean | null;
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

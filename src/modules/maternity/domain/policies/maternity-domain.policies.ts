import {
  MaternityInvalidDiagnosisYearError,
  MaternityNikCollisionError,
} from '../errors/maternity.errors';

export function normalizeNullableString(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

export function calculateBmi(
  heightCm?: number | null,
  weightKg?: number | null,
): number | null {
  if (!heightCm || !weightKg) return null;
  const heightM = Number(heightCm) / 100;
  const weight = Number(weightKg);
  if (heightM <= 0 || weight <= 0) return null;
  return Number((weight / (heightM * heightM)).toFixed(1));
}

export function assertDistinctNiks(
  motherNik?: string | null,
  partnerNik?: string | null,
): void {
  if (!motherNik || !partnerNik) return;
  const cleanMother = motherNik.trim();
  const cleanPartner = partnerNik.trim();
  if (cleanMother && cleanPartner && cleanMother === cleanPartner) {
    throw new MaternityNikCollisionError();
  }
}

export interface HealthConditionPolicyInput {
  conditionCode: string;
  hasCondition: boolean;
  diagnosisYear?: number | null;
}

export function validateDiagnosisYears(
  conditions: HealthConditionPolicyInput[] | undefined,
  motherBirthDate?: string | null,
): void {
  if (!conditions || conditions.length === 0) return;
  const currentYear = new Date().getFullYear();
  let motherBirthYear: number | null = null;
  if (motherBirthDate) {
    const parsed = new Date(motherBirthDate).getFullYear();
    if (!Number.isNaN(parsed)) {
      motherBirthYear = parsed;
    }
  }

  for (const cond of conditions) {
    if (cond.diagnosisYear !== null && cond.diagnosisYear !== undefined) {
      if (cond.diagnosisYear > currentYear) {
        throw new MaternityInvalidDiagnosisYearError(
          `Tahun terdiagnosis (${cond.diagnosisYear}) tidak boleh melebihi tahun saat ini (${currentYear})`,
        );
      }
      if (motherBirthYear && cond.diagnosisYear < motherBirthYear) {
        throw new MaternityInvalidDiagnosisYearError(
          `Tahun terdiagnosis (${cond.diagnosisYear}) tidak boleh lebih awal dari tahun kelahiran pasien (${motherBirthYear})`,
        );
      }
    }
  }
}

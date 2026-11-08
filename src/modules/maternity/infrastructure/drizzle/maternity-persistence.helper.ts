import { PersistMaternityIntakePatch } from '../../domain/commands/maternity.commands';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';

export function toSafeInt(
  val: unknown,
  min: number = 0,
  max: number = 2147483647,
): number | null {
  if (val === undefined || val === null || val === '') return null;
  const normalized =
    typeof val === 'string' ? val.trim().replace(',', '.') : val;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function toSafeNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const normalized =
    typeof val === 'string' ? val.trim().replace(',', '.') : val;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function toSafeNumericString(
  val: unknown,
  maxPrecisionDigits: number = 3,
  scale: number = 1,
): string | null {
  if (val === undefined || val === null || val === '') return null;
  const normalized =
    typeof val === 'string' ? val.trim().replace(',', '.') : val;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  const maxVal = 10 ** maxPrecisionDigits - 10 ** -scale;
  const clamped = Math.min(maxVal, n);
  return clamped.toFixed(scale);
}

export function toSafeString(val: unknown, maxLength?: number): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s) return null;
  return maxLength ? s.slice(0, maxLength) : s;
}

export function mapPreviousPregnancyRow(
  p: {
    orderNumber?: number;
    birthYear?: string | null;
    birthWeightGrams?: number | null;
    birthLengthCm?: number | string | null;
    childSex?: string | null;
    gestationalAgeAtBirth?: string | null;
    birthAttendant?: string | null;
    deliveryMethod?: string | null;
    deliveryPlace?: string | null;
    complications?: string | null;
  },
  maternalIntakeId: string,
  idx: number,
) {
  return {
    maternalIntakeId,
    orderNumber: toSafeInt(p.orderNumber, 1, 100) || idx + 1,
    birthYear: toSafeString(p.birthYear, 16),
    birthWeightGrams: toSafeInt(p.birthWeightGrams, 0, 30000),
    birthLengthCm: toSafeNumericString(p.birthLengthCm, 3, 1),
    childSex: toSafeString(p.childSex, 16),
    gestationalAgeAtBirth: toSafeString(p.gestationalAgeAtBirth, 64),
    birthAttendant: toSafeString(p.birthAttendant, 128),
    deliveryMethod: toSafeString(p.deliveryMethod, 64),
    deliveryPlace: toSafeString(p.deliveryPlace, 128),
    complications: toSafeString(p.complications),
  };
}

export function mapContraceptiveHistoryRow(
  c: {
    orderNumber?: number;
    startDate?: string | null;
    contraceptiveType?: string | null;
    durationText?: string | null;
    stopDate?: string | null;
    problems?: string | null;
    sideEffects?: string | null;
  },
  maternalIntakeId: string,
  idx: number,
) {
  return {
    maternalIntakeId,
    orderNumber: toSafeInt(c.orderNumber, 1, 100) || idx + 1,
    startDate: c.startDate || null,
    contraceptiveType: toSafeString(c.contraceptiveType, 64),
    durationText: toSafeString(c.durationText, 64),
    stopDate: c.stopDate || null,
    problems: toSafeString(c.problems),
    sideEffects: toSafeString(c.sideEffects),
  };
}

export function mapToMaternityEntity(record: any): MaternityIntakeEntity {
  return new MaternityIntakeEntity({
    id: record.id,
    patientId: record.patientId,
    appointmentId: record.appointmentId,
    motherNik: record.motherNik,
    motherName: record.motherName,
    motherBirthDate: record.motherBirthDate,
    motherAge: record.motherAge,
    marriageOrder: record.marriageOrder,
    marriageDate: record.marriageDate,
    motherJob: record.motherJob,
    motherEducation: record.motherEducation,
    religion: record.religion,
    phoneNumber: record.phoneNumber,
    domicileAddress: record.domicileAddress,
    identityCardAddress: record.identityCardAddress,
    dasawisma: record.dasawisma,
    posyandu: record.posyandu,
    puskesmas: record.puskesmas,
    partnerName: record.partnerName,
    partnerNik: record.partnerNik,
    partnerBirthDate: record.partnerBirthDate,
    partnerAge: record.partnerAge,
    partnerJob: record.partnerJob,
    partnerEducation: record.partnerEducation,
    partnerBloodType: record.partnerBloodType,
    heightCm: toSafeNumber(record.heightCm),
    prePregnancyWeightKg: toSafeNumber(record.prePregnancyWeightKg),
    upperArmCircumferenceCm: toSafeNumber(record.upperArmCircumferenceCm),
    initialBmi: toSafeNumber(record.initialBmi),
    tetanusStatus: record.tetanusStatus,
    motherBloodType: record.motherBloodType,
    hpht: record.hpht,
    estimatedDueDate: record.estimatedDueDate,
    gestationalAgeWeeks: toSafeNumber(record.gestationalAgeWeeks),
    gestationalAgeFormatted: record.gestationalAgeFormatted,
    currentComplaints: record.currentComplaints,
    gravidaCount: record.gravidaCount,
    parityCount: record.parityCount,
    abortionCount: record.abortionCount,
    livingChildrenCount: record.livingChildrenCount,
    hasPreviousPregnancyHistory: record.hasPreviousPregnancyHistory,
    hasContraceptionHistory: record.hasContraceptionHistory,
    smokedBeforePregnancy: record.smokedBeforePregnancy,
    alcoholBeforePregnancy: record.alcoholBeforePregnancy,
    irregularDietBeforePregnancy: record.irregularDietBeforePregnancy,
    reducedPhysicalActivityBeforePregnancy:
      record.reducedPhysicalActivityBeforePregnancy,
    unprescribedMedicationBeforePregnancy:
      record.unprescribedMedicationBeforePregnancy,
    concerningCosmeticUseBeforePregnancy:
      record.concerningCosmeticUseBeforePregnancy,
    pesticideExposureBeforePregnancy: record.pesticideExposureBeforePregnancy,
    chemicalExposureBeforePregnancy: record.chemicalExposureBeforePregnancy,
    smokeExposureBeforePregnancy: record.smokeExposureBeforePregnancy,
    concerningEnvironmentNotes: record.concerningEnvironmentNotes,
    allergyInfo: record.allergyInfo,
    otherNotes: record.otherNotes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    husbandProfile: record.husband || null,
    previousPregnancies: (record.previousPregnancies || []).map((p: any) => ({
      ...p,
      birthWeightGrams: toSafeInt(p.birthWeightGrams, 0, 30000),
      birthLengthCm: toSafeNumber(p.birthLengthCm),
    })),
    contraceptiveHistories: record.contraceptiveHistories || [],
    conditionResponses: (record.healthConditions || []).map((hc: any) => ({
      id: hc.id,
      maternalIntakeId: hc.maternalIntakeId,
      conditionCode: hc.conditionCode,
      hasCondition: hc.hasCondition,
      diagnosisYear: hc.diagnosisYear,
      notes: hc.notes,
      createdAt: hc.createdAt,
    })),
  });
}

const NON_HEADER_KEYS = new Set([
  'husband',
  'previousPregnancies',
  'contraceptiveHistories',
  'healthConditions',
  'patientIdentitySync',
  'appointmentComplaintSync',
  'submittedByUserId',
]);

const NUMERIC_COLUMNS: Record<string, [number, number]> = {
  heightCm: [3, 2],
  prePregnancyWeightKg: [3, 2],
  upperArmCircumferenceCm: [3, 1],
  initialBmi: [3, 1],
  gestationalAgeWeeks: [3, 1],
};

export function buildMaternalHeaderPatch(
  patch: PersistMaternityIntakePatch,
): Record<string, unknown> {
  const headerPatch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || NON_HEADER_KEYS.has(key)) continue;

    if (key in NUMERIC_COLUMNS) {
      const [digits, scale] = NUMERIC_COLUMNS[key];
      headerPatch[key] = toSafeNumericString(value, digits, scale);
    } else {
      headerPatch[key] = value;
    }
  }

  headerPatch.updatedAt = new Date().toISOString();
  return headerPatch;
}

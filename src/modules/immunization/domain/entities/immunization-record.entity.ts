import type { ImmunizationEntryStatus } from '../constants/immunization.constants';
import type { Gender } from '../../../../database/schema';

export interface ChildImmunizationIntakeEntity {
  id: string;
  intakeSubmissionId?: string | null;
  patientId: string;
  appointmentId?: string | null;
  childName: string;
  childNik?: string | null;
  childBirthDate: string;
  childSex: Gender;
  childAgeFormatted?: string | null;
  parentPhone: string;
  fatherName?: string | null;
  motherName?: string | null;
  childAddress?: string | null;
  previousVaccineHistory?: string | null;
  childAllergyHistory?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChildImmunizationClinicalEntryEntity {
  id: string;
  intakeId: string;
  patientId: string;
  appointmentId?: string | null;
  administeredBy?: string | null;
  rowIndex: number;
  vaccineName: string;
  vaccineCode: string;
  status: ImmunizationEntryStatus;
  injectionDate?: string | null;
  ageDisplay?: string | null;
  fever?: string | null;
  cough?: string | null;
  runnyNose?: string | null;
  weightKg?: string | number | null;
  heightCm?: string | number | null;
  headCircumferenceCm?: string | number | null;
  temperatureCelsius?: string | number | null;
  planning?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanonicalLedgerSlot {
  rowIndex: number;
  vaccineName: string;
  vaccineCode: string;
  defaultAgeDisplay: string;
  isGiven: boolean;
  entry?: ChildImmunizationClinicalEntryEntity | null;
  formattedDisplay: {
    injectionDate: string;
    age: string;
    subjective: string[];
    objective: string[];
    planning: string;
  };
}

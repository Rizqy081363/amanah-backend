import type { ImmunizationEntryStatus } from '../constants/immunization.constants';
import type { Gender } from '../../../../database/schema';
import {
  ChildImmunizationClinicalEntryEntity,
  ChildImmunizationIntakeEntity,
} from '../entities/immunization-record.entity';

export interface CreateImmunizationIntakeData {
  patientId: string;
  appointmentId?: string | null;
  childName?: string;
  childNik?: string | null;
  childBirthDate?: string;
  childSex?: Gender;
  childAgeFormatted?: string | null;
  parentPhone?: string;
  fatherName?: string | null;
  motherName?: string | null;
  childAddress?: string | null;
  line1?: string | null;
  provinceCode?: string | null;
  provinceName?: string | null;
  regencyCode?: string | null;
  regencyName?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  villageCode?: string | null;
  villageName?: string | null;
  previousVaccineHistory?: string | null;
  childAllergyHistory?: string | null;
}

export interface UpdateImmunizationIntakeData {
  childName?: string;
  childNik?: string | null;
  childBirthDate?: string;
  childSex?: Gender;
  childAgeFormatted?: string;
  parentPhone?: string;
  fatherName?: string;
  motherName?: string;
  childAddress?: string;
  line1?: string;
  provinceCode?: string;
  provinceName?: string;
  regencyCode?: string;
  regencyName?: string;
  districtCode?: string;
  districtName?: string;
  villageCode?: string;
  villageName?: string;
  previousVaccineHistory?: string;
  childAllergyHistory?: string;
  entries?: SaveClinicalEntryData[];
}

export interface SaveClinicalEntryData {
  rowIndex: number;
  vaccineName?: string;
  vaccineCode?: string;
  status: ImmunizationEntryStatus;
  injectionDate?: string | null;
  ageDisplay?: string | null;
  fever?: string | null;
  cough?: string | null;
  runnyNose?: string | null;
  weightKg?: number | null;
  heightCm?: number | null;
  headCircumferenceCm?: number | null;
  temperatureCelsius?: number | null;
  planning?: string | null;
  appointmentId?: string | null;
  administeredBy?: string | null;
  notes?: string | null;
}

export interface ImmunizationHistoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  patientId?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedImmunizationHistory {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const IMMUNIZATION_REPOSITORY = Symbol('IMMUNIZATION_REPOSITORY');

export interface IImmunizationRepository {
  createIntake(
    data: CreateImmunizationIntakeData,
    submittedByUserId?: string,
  ): Promise<ChildImmunizationIntakeEntity>;

  updateIntake(
    id: string,
    data: UpdateImmunizationIntakeData,
  ): Promise<ChildImmunizationIntakeEntity | null>;

  findIntakeById(id: string): Promise<any | null>;

  findIntakeByAppointmentId(appointmentId: string): Promise<any | null>;

  findChildCumulativeLedger(
    patientId: string,
  ): Promise<ChildImmunizationClinicalEntryEntity[]>;

  upsertClinicalEntries(
    patientId: string,
    intakeId: string,
    entries: SaveClinicalEntryData[],
    appointmentId?: string | null,
    administeredBy?: string | null,
  ): Promise<ChildImmunizationClinicalEntryEntity[]>;

  findHistory(
    query: ImmunizationHistoryQuery,
  ): Promise<PaginatedImmunizationHistory>;
}

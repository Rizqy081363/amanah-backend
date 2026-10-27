import { MedicalIntakeSubmissionEntity } from '../entities/medical-intake.entity';
import {
  MedicalRecordEntity,
  PrescriptionItem,
} from '../entities/medical-record.entity';

export const MEDICAL_RECORD_REPOSITORY = 'MEDICAL_RECORD_REPOSITORY';

export interface UpdateDiagnosisData {
  staffId?: string;
  diagnosis?: string;
  diagnosisIcd10Code?: string;
  diagnosisIcd10Name?: string;
  tindakan?: string;
  resepObat?: string;
  prescriptions?: PrescriptionItem[];
  catatanMedis?: string;
  status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';
}

export interface MedicalRecordFilterOptions {
  page?: number;
  limit?: number;
  cursor?: string;
  patientId?: string;
  practitionerId?: string;
  serviceId?: string;
  status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  flowType?: 'pregnancy' | 'immunization' | 'general';
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface MedicalRecordRepository {
  create(
    data: Omit<
      MedicalRecordEntity,
      'id' | 'createdAt' | 'updatedAt' | 'patient' | 'practitioner' | 'service'
    >,
    createdByUserId?: string,
  ): Promise<MedicalRecordEntity>;

  findById(id: string): Promise<MedicalRecordEntity | null>;

  findAll(filters?: MedicalRecordFilterOptions): Promise<{
    data: MedicalRecordEntity[];
    total: number;
    page: number;
    limit: number;
    meta: {
      nextCursor: string | null;
      hasNextPage: boolean;
      limit: number;
      total: number;
      page: number;
      totalPages: number;
    };
  }>;

  findByKunjunganId(kunjunganId: string): Promise<MedicalRecordEntity | null>;

  findByPatientId(patientId: string): Promise<MedicalRecordEntity[]>;

  update(
    id: string,
    data: Partial<MedicalRecordEntity>,
    expectedVersion?: string,
  ): Promise<MedicalRecordEntity | null>;

  updateDiagnosis(
    id: string,
    data: UpdateDiagnosisData,
    expectedVersion?: string,
  ): Promise<MedicalRecordEntity | null>;

  delete(id: string): Promise<boolean>;

  // Medical Intake / Screening methods
  createIntake(
    data: Omit<
      MedicalIntakeSubmissionEntity,
      'id' | 'createdAt' | 'updatedAt' | 'submittedAt'
    >,
    submittedByUserId?: string,
  ): Promise<MedicalIntakeSubmissionEntity>;

  findIntakeById(id: string): Promise<MedicalIntakeSubmissionEntity | null>;

  findIntakesByPatientId(
    patientId: string,
  ): Promise<MedicalIntakeSubmissionEntity[]>;

  createMaternalIntake(dto: any, submittedByUserId?: string): Promise<any>;

  updateMaternalIntake(id: string, dto: any): Promise<any | null>;

  findMaternalIntakeById(id: string): Promise<any | null>;

  findMaternalIntakeByAppointmentId(appointmentId: string): Promise<any | null>;

  createImmunizationIntake(dto: any, submittedByUserId?: string): Promise<any>;

  updateImmunizationIntake(id: string, dto: any): Promise<any | null>;

  updateIntakeSubmission(
    id: string,
    answers: Record<string, any>,
  ): Promise<any | null>;

  findImmunizationIntakeById(id: string): Promise<any | null>;

  findImmunizationIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null>;

  findUnifiedIntakeByAppointmentId(appointmentId: string): Promise<any | null>;

  findLatestIntakeByPatientId(
    patientId: string,
    flow?: string,
  ): Promise<any | null>;

  findMaternalHistory(
    patientIds: string[],
    query: {
      page?: number;
      limit?: number;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  findImmunizationHistory(
    patientIds: string[],
    query: {
      page?: number;
      limit?: number;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
}

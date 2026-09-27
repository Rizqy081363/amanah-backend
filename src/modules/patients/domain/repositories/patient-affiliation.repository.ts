import type {
  PatientAffiliationEntity,
  PatientRelationshipType,
} from '../entities/patient-affiliation.entity';

export const PATIENT_AFFILIATION_REPOSITORY = Symbol(
  'PATIENT_AFFILIATION_REPOSITORY',
);

export interface CreateAffiliationParams {
  userId: string;
  patientId: string;
  relationshipType: PatientRelationshipType;
  relationLabel?: string | null;
  isPrimary?: boolean;
}

export interface PatientAffiliationRepository {
  findByUserId(userId: string): Promise<PatientAffiliationEntity[]>;
  findByUserAndPatient(
    userId: string,
    patientId: string,
  ): Promise<PatientAffiliationEntity | null>;
  create(params: CreateAffiliationParams): Promise<PatientAffiliationEntity>;
  update(
    id: string,
    params: Partial<CreateAffiliationParams>,
  ): Promise<PatientAffiliationEntity | null>;
  delete(userId: string, patientId: string): Promise<boolean>;
}

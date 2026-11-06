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
  relationshipTypeId?: string;
  relationshipType?: PatientRelationshipType;
  relationLabel?: string | null;
  isPrimary?: boolean;
}

export interface PatientAffiliationRepository {
  findByUserId(userId: string): Promise<PatientAffiliationEntity[]>;
  findByUserAndPatient(
    userId: string,
    patientId: string,
    tx?: unknown,
  ): Promise<PatientAffiliationEntity | null>;
  create(
    params: CreateAffiliationParams,
    tx?: unknown,
  ): Promise<PatientAffiliationEntity>;
  update(
    id: string,
    params: Partial<CreateAffiliationParams>,
    tx?: unknown,
  ): Promise<PatientAffiliationEntity | null>;
  delete(userId: string, patientId: string, tx?: unknown): Promise<boolean>;
}

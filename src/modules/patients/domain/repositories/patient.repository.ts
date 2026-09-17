import { PatientEntity } from '../entities/patient.entity';

export const PATIENT_REPOSITORY = 'PATIENT_REPOSITORY';

export interface PatientRepository {
  create(
    data: Omit<PatientEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PatientEntity>;
  findById(id: string): Promise<PatientEntity | null>;
  findByUserId(userId: string): Promise<PatientEntity | null>;
  findByNik(nik: string): Promise<PatientEntity | null>;
  findByRecordNumber(rm: string): Promise<PatientEntity | null>;
  findMany(
    limit?: number,
    offset?: number,
    search?: string,
  ): Promise<PatientEntity[]>;
  update(
    id: string,
    data: Partial<PatientEntity>,
  ): Promise<PatientEntity | null>;
  delete(id: string): Promise<boolean>;
}

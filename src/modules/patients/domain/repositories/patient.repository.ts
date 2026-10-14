import { PatientDirectoryQueryDto } from '../../presentation/dto/patient-directory-query.dto';
import { PatientDirectoryResponseDto } from '../../presentation/dto/patient-directory-response.dto';
import { RegisterPatientDto } from '../../presentation/dto/register-patient.dto';
import { PatientEntity } from '../entities/patient.entity';

export const PATIENT_REPOSITORY = 'PATIENT_REPOSITORY';

export interface PatientRepository {
  create(
    data: Omit<PatientEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PatientEntity>;
  register(userId: string, dto: RegisterPatientDto): Promise<PatientEntity>;
  findById(id: string): Promise<PatientEntity | null>;
  findByUserId(userId: string): Promise<PatientEntity | null>;
  findByNik(nik: string): Promise<PatientEntity | null>;
  findByRecordNumber(rm: string): Promise<PatientEntity | null>;
  findMany(
    limit?: number,
    offset?: number,
    search?: string,
  ): Promise<PatientEntity[]>;
  findDirectory(
    query: PatientDirectoryQueryDto,
  ): Promise<PatientDirectoryResponseDto>;
  update(
    id: string,
    data: Partial<PatientEntity> | Record<string, any>,
  ): Promise<PatientEntity | null>;
  delete(id: string): Promise<boolean>;
  bulkDelete(ids: string[]): Promise<{ count: number }>;
}

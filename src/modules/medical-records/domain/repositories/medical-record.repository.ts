import { MedicalRecordEntity } from '../entities/medical-record.entity';

export const MEDICAL_RECORD_REPOSITORY = 'MEDICAL_RECORD_REPOSITORY';

export interface MedicalRecordRepository {
  create(
    data: Omit<MedicalRecordEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<MedicalRecordEntity>;
  findByKunjunganId(kunjunganId: string): Promise<MedicalRecordEntity | null>;
  findByPatientId(patientId: string): Promise<MedicalRecordEntity[]>;
  updateDiagnosis(
    id: string,
    data: {
      staffId?: string;
      diagnosis?: string;
      tindakan?: string;
      resepObat?: string;
      catatanMedis?: string;
    },
  ): Promise<MedicalRecordEntity | null>;
}

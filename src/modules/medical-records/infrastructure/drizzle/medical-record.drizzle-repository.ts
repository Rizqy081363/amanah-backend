import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { MedicalRecordRepository } from '../../domain/repositories/medical-record.repository';
import { MedicalRecordEntity } from '../../domain/entities/medical-record.entity';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { rekamMedisKunjungan } from '../../../../database/schema';

@Injectable()
export class MedicalRecordDrizzleRepository implements MedicalRecordRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(
    data: Omit<MedicalRecordEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<MedicalRecordEntity> {
    const [record] = await this.db
      .insert(rekamMedisKunjungan)
      .values({
        kunjunganId: data.kunjunganId,
        patientId: data.patientId,
        staffId: data.staffId || null,
        flowType: data.flowType,
        motherNik: data.motherNik,
        partnerNik: data.partnerNik,
        childNik: data.childNik,
        formData: data.formData || {},
        computedData: data.computedData || {},
        diagnosis: data.diagnosis,
        tindakan: data.tindakan,
        resepObat: data.resepObat,
        catatanMedis: data.catatanMedis,
      })
      .returning();

    return record as unknown as MedicalRecordEntity;
  }

  async findByKunjunganId(
    kunjunganId: string,
  ): Promise<MedicalRecordEntity | null> {
    const record = await this.db.query.rekamMedisKunjungan.findFirst({
      where: eq(rekamMedisKunjungan.kunjunganId, kunjunganId),
    });
    return (record as unknown as MedicalRecordEntity) || null;
  }

  async findByPatientId(patientId: string): Promise<MedicalRecordEntity[]> {
    const records = await this.db.query.rekamMedisKunjungan.findMany({
      where: eq(rekamMedisKunjungan.patientId, patientId),
    });
    return records as unknown as MedicalRecordEntity[];
  }

  async updateDiagnosis(
    id: string,
    data: {
      staffId?: string;
      diagnosis?: string;
      tindakan?: string;
      resepObat?: string;
      catatanMedis?: string;
    },
  ): Promise<MedicalRecordEntity | null> {
    const [updated] = await this.db
      .update(rekamMedisKunjungan)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(rekamMedisKunjungan.id, id))
      .returning();

    return (updated as unknown as MedicalRecordEntity) || null;
  }
}

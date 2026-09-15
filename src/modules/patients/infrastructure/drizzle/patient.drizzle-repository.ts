import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PatientRepository } from '../../domain/repositories/patient.repository';
import { PatientEntity } from '../../domain/entities/patient.entity';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { patients } from '../../../../database/schema';

@Injectable()
export class PatientDrizzleRepository implements PatientRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(
    data: Omit<PatientEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PatientEntity> {
    const [record] = await this.db
      .insert(patients)
      .values({
        userId: data.userId,
        medicalRecordNumber: data.medicalRecordNumber,
        nik: data.nik,
        fullName: data.fullName,
        gender: data.gender,
        birthPlace: data.birthPlace,
        birthDate: data.birthDate,
        bloodType: data.bloodType as any,
        namaIbuKandung: data.namaIbuKandung,
        pekerjaan: data.pekerjaan,
        phoneNumber: data.phoneNumber,
        address: data.address,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        allergies: data.allergies || [],
        medicalHistory: data.medicalHistory,
        avatarUrl: data.avatarUrl,
      })
      .returning();

    return record as PatientEntity;
  }

  async findById(id: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patients.findFirst({
      where: eq(patients.id, id),
    });
    return (record as PatientEntity) || null;
  }

  async findByUserId(userId: number): Promise<PatientEntity | null> {
    const record = await this.db.query.patients.findFirst({
      where: eq(patients.userId, userId),
    });
    return (record as PatientEntity) || null;
  }

  async findByNik(nik: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patients.findFirst({
      where: eq(patients.nik, nik),
    });
    return (record as PatientEntity) || null;
  }

  async findByRecordNumber(rm: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patients.findFirst({
      where: eq(patients.medicalRecordNumber, rm),
    });
    return (record as PatientEntity) || null;
  }

  async findMany(limit = 20, offset = 0): Promise<PatientEntity[]> {
    const records = await this.db.query.patients.findMany({
      limit,
      offset,
    });
    return records as PatientEntity[];
  }

  async update(
    id: string,
    data: Partial<PatientEntity>,
  ): Promise<PatientEntity | null> {
    const [updated] = await this.db
      .update(patients)
      .set({
        ...data,
        updatedAt: new Date(),
      } as any)
      .where(eq(patients.id, id))
      .returning();

    return (updated as PatientEntity) || null;
  }
}

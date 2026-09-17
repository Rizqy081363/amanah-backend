import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { patientAddresses, patientProfiles } from '../../../../database/schema';
import { PatientEntity } from '../../domain/entities/patient.entity';
import { PatientRepository } from '../../domain/repositories/patient.repository';

@Injectable()
export class PatientDrizzleRepository implements PatientRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(record: any): PatientEntity {
    return {
      id: record.id,
      userId: record.userId || '',
      medicalRecordNumber: record.medicalRecordNumber,
      nik: record.nationalIdEncrypted || record.nationalIdHash || '',
      fullName: record.fullName,
      gender: record.gender === 'female' ? 'Perempuan' : 'Laki-laki',
      birthPlace: record.birthPlace || '',
      birthDate:
        typeof record.birthDate === 'string'
          ? record.birthDate
          : record.birthDate?.toISOString?.()?.slice(0, 10) || '',
      bloodType: record.bloodType || 'unknown',
      namaIbuKandung: record.motherName || null,
      pekerjaan: record.occupation || null,
      phoneNumber: record.phone || '',
      address: record.patientAddresses?.[0]?.fullAddress || 'Bandung',
      emergencyContactName: null,
      emergencyContactPhone: null,
      allergies: [],
      medicalHistory: record.medicalHistorySummary || null,
      avatarUrl: record.avatarUrl || null,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
  }

  async create(
    data: Omit<PatientEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PatientEntity> {
    const rmNumber =
      data.medicalRecordNumber ||
      `RM-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    const [record] = await this.db
      .insert(patientProfiles)
      .values({
        userId: data.userId || null,
        medicalRecordNumber: rmNumber,
        nationalIdEncrypted: data.nik,
        nationalIdHash: data.nik,
        fullName: data.fullName,
        gender: data.gender === 'Perempuan' ? 'female' : 'male',
        birthPlace: data.birthPlace,
        birthDate: data.birthDate,
        bloodType: 'unknown',
        phone: data.phoneNumber,
        motherName: data.namaIbuKandung || null,
        occupation: data.pekerjaan || null,
        medicalHistorySummary: data.medicalHistory || null,
        avatarUrl: data.avatarUrl || null,
        status: 'active',
      })
      .returning();

    if (data.address) {
      await this.db.insert(patientAddresses).values({
        patientId: record.id,
        type: 'domicile',
        line1: data.address,
        fullAddress: data.address,
        isPrimary: true,
      });
    }

    return this.findById(record.id) as Promise<PatientEntity>;
  }

  async findById(id: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.id, id),
      with: {
        patientAddresses: true,
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByUserId(userId: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.userId, userId),
      with: {
        patientAddresses: true,
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByNik(nik: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: or(
        eq(patientProfiles.nationalIdEncrypted, nik),
        eq(patientProfiles.nationalIdHash, nik),
      ),
      with: {
        patientAddresses: true,
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByRecordNumber(rm: string): Promise<PatientEntity | null> {
    const record = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.medicalRecordNumber, rm),
      with: {
        patientAddresses: true,
      },
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findMany(
    limit = 20,
    offset = 0,
    search?: string,
  ): Promise<PatientEntity[]> {
    let whereClause = eq(patientProfiles.status, 'active');
    if (search?.trim()) {
      whereClause = or(
        ilike(patientProfiles.fullName, `%${search.trim()}%`),
        ilike(patientProfiles.medicalRecordNumber, `%${search.trim()}%`),
      ) as any;
    }

    const records = await this.db.query.patientProfiles.findMany({
      where: whereClause,
      limit,
      offset,
      with: {
        patientAddresses: true,
      },
    });
    return records.map((r) => this.mapRecordToEntity(r));
  }

  async update(
    id: string,
    data: Partial<PatientEntity>,
  ): Promise<PatientEntity | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.fullName !== undefined) updateValues.fullName = data.fullName;
    if (data.phoneNumber !== undefined) updateValues.phone = data.phoneNumber;
    if (data.medicalHistory !== undefined)
      updateValues.medicalHistorySummary = data.medicalHistory;
    if (data.pekerjaan !== undefined) updateValues.occupation = data.pekerjaan;
    if (data.nik !== undefined) {
      updateValues.nationalIdEncrypted = data.nik;
      updateValues.nationalIdHash = data.nik;
    }

    const [updated] = await this.db
      .update(patientProfiles)
      .set(updateValues)
      .where(eq(patientProfiles.id, id))
      .returning();

    if (data.address && updated) {
      const existingAddress = await this.db.query.patientAddresses.findFirst({
        where: eq(patientAddresses.patientId, id),
      });
      if (existingAddress) {
        await this.db
          .update(patientAddresses)
          .set({
            line1: data.address,
            fullAddress: data.address,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(patientAddresses.id, existingAddress.id));
      } else {
        await this.db.insert(patientAddresses).values({
          patientId: id,
          type: 'domicile',
          line1: data.address,
          fullAddress: data.address,
          isPrimary: true,
        });
      }
    }

    return updated ? this.findById(updated.id) : null;
  }

  async delete(id: string): Promise<boolean> {
    await this.db
      .update(patientProfiles)
      .set({ status: 'inactive', updatedAt: new Date().toISOString() })
      .where(eq(patientProfiles.id, id));

    return true;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffCredentials, staffProfiles } from '../../../../database/schema';
import { StaffEntity } from '../../domain/entities/staff.entity';
import { StaffRepository } from '../../domain/repositories/staff.repository';

@Injectable()
export class StaffDrizzleRepository implements StaffRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(r: any): StaffEntity {
    return {
      id: r.id,
      userId: r.userId || '',
      poliklinikId: r.primaryUnitId || '',
      fullName: r.fullName,
      profession: r.positionTitle || 'Staf Medis',
      idCardNumber: r.staffCode,
      photoUrl: r.avatarUrl || null,
      phoneNumber: r.phone || '',
      isActive: r.status === 'active',
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async create(
    data: Omit<StaffEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StaffEntity> {
    const staffTypeVal: 'doctor' | 'midwife' | 'worker' = data.profession
      .toLowerCase()
      .includes('bidan')
      ? 'midwife'
      : data.profession.toLowerCase().includes('dokter')
        ? 'doctor'
        : 'worker';

    const staffCode =
      data.idCardNumber || `STF-AMANAH-${Date.now().toString().slice(-4)}`;

    const [record] = await this.db
      .insert(staffProfiles)
      .values({
        userId: data.userId || null,
        primaryUnitId: data.poliklinikId || null,
        fullName: data.fullName,
        positionTitle: data.profession,
        staffCode,
        staffType: staffTypeVal,
        avatarUrl: data.photoUrl || null,
        phone: data.phoneNumber,
        status: data.isActive ? 'active' : 'inactive',
      })
      .returning();

    return this.mapRecordToEntity(record);
  }

  async findById(id: string): Promise<StaffEntity | null> {
    const record = await this.db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.id, id),
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByUserId(userId: string): Promise<StaffEntity | null> {
    const record = await this.db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.userId, userId),
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByCardNumber(cardNum: string): Promise<StaffEntity | null> {
    const record = await this.db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.staffCode, cardNum),
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByProfession(profession: string): Promise<StaffEntity[]> {
    const records = await this.db.query.staffProfiles.findMany({
      where: ilike(staffProfiles.positionTitle, `%${profession}%`),
    });
    return records.map((r) => this.mapRecordToEntity(r));
  }

  async findByPoliklinik(poliId: string): Promise<StaffEntity[]> {
    const records = await this.db.query.staffProfiles.findMany({
      where: eq(staffProfiles.primaryUnitId, poliId),
    });
    return records.map((r) => this.mapRecordToEntity(r));
  }

  async findAll(): Promise<StaffEntity[]> {
    const records = await this.db.query.staffProfiles.findMany({
      where: eq(staffProfiles.status, 'active'),
    });
    return records.map((r) => this.mapRecordToEntity(r));
  }

  async update(
    id: string,
    data: Partial<StaffEntity>,
  ): Promise<StaffEntity | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.fullName !== undefined) updateValues.fullName = data.fullName;
    if (data.profession !== undefined)
      updateValues.positionTitle = data.profession;
    if (data.phoneNumber !== undefined) updateValues.phone = data.phoneNumber;
    if (data.poliklinikId !== undefined)
      updateValues.primaryUnitId = data.poliklinikId;
    if (data.photoUrl !== undefined) updateValues.avatarUrl = data.photoUrl;
    if (data.isActive !== undefined)
      updateValues.status = data.isActive ? 'active' : 'inactive';

    const [updated] = await this.db
      .update(staffProfiles)
      .set(updateValues)
      .where(eq(staffProfiles.id, id))
      .returning();

    return updated ? this.mapRecordToEntity(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    await this.db
      .update(staffProfiles)
      .set({ status: 'inactive', updatedAt: new Date().toISOString() })
      .where(eq(staffProfiles.id, id));

    return true;
  }

  async findCredentials(staffId: string): Promise<any[]> {
    const records = await this.db.query.staffCredentials.findMany({
      where: eq(staffCredentials.staffProfileId, staffId),
    });
    return records.map((r) => ({
      id: r.id,
      staffProfileId: r.staffProfileId,
      credentialType: r.credentialType,
      credentialNumber: r.credentialNumberEncrypted || r.credentialNumberHash,
      issuer: r.issuer,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async addCredential(staffId: string, credential: any): Promise<any> {
    const [record] = await this.db
      .insert(staffCredentials)
      .values({
        staffProfileId: staffId,
        credentialType: credential.credentialType,
        credentialNumberHash: credential.credentialNumber,
        credentialNumberEncrypted: credential.credentialNumber,
        issuer: credential.issuer || null,
        issuedAt: credential.issuedAt || null,
        expiresAt: credential.expiresAt || null,
        status: 'verified',
      })
      .returning();

    return {
      id: record.id,
      staffProfileId: record.staffProfileId,
      credentialType: record.credentialType,
      credentialNumber:
        record.credentialNumberEncrypted || record.credentialNumberHash,
      issuer: record.issuer,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      status: record.status,
      createdAt: record.createdAt,
    };
  }
}

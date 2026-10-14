import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ilike } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  staffAddresses,
  staffCredentials,
  staffProfiles,
  user,
  users,
} from '../../../../database/schema';
import { StaffEntity } from '../../domain/entities/staff.entity';
import { StaffRepository } from '../../domain/repositories/staff.repository';

@Injectable()
export class StaffDrizzleRepository implements StaffRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(r: any, addressRecord?: any): StaffEntity {
    return {
      id: r.id,
      userId: r.userId || '',
      poliklinikId: r.primaryUnitId || '',
      fullName: r.fullName,
      profession: r.positionTitle || 'Staf Operasional',
      staffType: r.staffType || 'worker',
      idCardNumber: r.staffCode,
      birthPlace: r.birthPlace || null,
      birthDate: r.birthDate ? String(r.birthDate) : null,
      gender: r.gender || null,
      nationalId: r.nationalIdEncrypted || r.nationalIdHash || null,
      email: r.email || null,
      photoUrl: r.avatarUrl || null,
      phoneNumber: r.phone || '',
      isActive: r.status === 'active',
      address: addressRecord
        ? {
            provinceCode: addressRecord.provinceCode || null,
            provinceName: addressRecord.provinceName || null,
            regencyCode: addressRecord.regencyCode || null,
            regencyName: addressRecord.regencyName || null,
            districtCode: addressRecord.districtCode || null,
            districtName: addressRecord.districtName || null,
            villageCode: addressRecord.villageCode || null,
            villageName: addressRecord.villageName || null,
            line1: addressRecord.line1 || null,
            fullAddress: addressRecord.fullAddress || null,
          }
        : null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async create(
    data: Omit<StaffEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StaffEntity> {
    const staffTypeVal: 'doctor' | 'midwife' | 'worker' =
      data.staffType ||
      (data.profession?.toLowerCase().includes('bidan')
        ? 'midwife'
        : data.profession?.toLowerCase().includes('dokter')
          ? 'doctor'
          : 'worker');

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
        birthPlace: data.birthPlace || null,
        birthDate: data.birthDate ? String(data.birthDate) : null,
        gender: data.gender || null,
        nationalIdHash: data.nationalId || null,
        nationalIdEncrypted: data.nationalId || null,
        email: data.email || null,
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
    if (!record) return null;

    const primaryAddr = await this.db.query.staffAddresses.findFirst({
      where: and(
        eq(staffAddresses.staffProfileId, id),
        eq(staffAddresses.isPrimary, true),
      ),
    });

    return this.mapRecordToEntity(record, primaryAddr);
  }

  async findByUserId(userId: string): Promise<StaffEntity | null> {
    const record = await this.db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.userId, userId),
    });
    if (!record) return null;

    const primaryAddr = await this.db.query.staffAddresses.findFirst({
      where: and(
        eq(staffAddresses.staffProfileId, record.id),
        eq(staffAddresses.isPrimary, true),
      ),
    });

    return this.mapRecordToEntity(record, primaryAddr);
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
      where: and(
        eq(staffProfiles.status, 'active'),
        eq(staffProfiles.staffType, 'worker'),
      ),
      with: {
        addresses: true,
      },
    });
    return records.map((r: any) => {
      const primaryAddr =
        r.addresses?.find((a: any) => a.isPrimary) || r.addresses?.[0];
      return this.mapRecordToEntity(r, primaryAddr);
    });
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
    if (data.staffType !== undefined) updateValues.staffType = data.staffType;
    if (data.birthPlace !== undefined)
      updateValues.birthPlace = data.birthPlace;
    if (data.birthDate !== undefined) updateValues.birthDate = data.birthDate;
    if (data.gender !== undefined) updateValues.gender = data.gender;
    if (data.nationalId !== undefined) {
      updateValues.nationalIdHash = data.nationalId;
      updateValues.nationalIdEncrypted = data.nationalId;
    }
    if (data.email !== undefined) updateValues.email = data.email;
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

    if (!updated) return null;

    // Persist address into staff_addresses if provided
    if (data.address) {
      const existingAddr = await this.db.query.staffAddresses.findFirst({
        where: and(
          eq(staffAddresses.staffProfileId, id),
          eq(staffAddresses.isPrimary, true),
        ),
      });

      const line1Val = data.address.line1 || data.address.fullAddress || '-';
      const fullAddressVal =
        data.address.fullAddress ||
        [
          data.address.line1,
          data.address.villageName ? `Kel. ${data.address.villageName}` : null,
          data.address.districtName ? `Kec. ${data.address.districtName}` : null,
          data.address.regencyName,
          data.address.provinceName,
        ]
          .filter(Boolean)
          .join(', ');

      if (existingAddr) {
        await this.db
          .update(staffAddresses)
          .set({
            provinceCode: data.address.provinceCode || existingAddr.provinceCode,
            provinceName: data.address.provinceName || existingAddr.provinceName,
            regencyCode: data.address.regencyCode || existingAddr.regencyCode,
            regencyName: data.address.regencyName || existingAddr.regencyName,
            districtCode: data.address.districtCode || existingAddr.districtCode,
            districtName: data.address.districtName || existingAddr.districtName,
            villageCode: data.address.villageCode || existingAddr.villageCode,
            villageName: data.address.villageName || existingAddr.villageName,
            line1: line1Val,
            fullAddress: fullAddressVal,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffAddresses.id, existingAddr.id));
      } else {
        await this.db.insert(staffAddresses).values({
          staffProfileId: id,
          type: 'domicile',
          provinceCode: data.address.provinceCode || null,
          provinceName: data.address.provinceName || null,
          regencyCode: data.address.regencyCode || null,
          regencyName: data.address.regencyName || null,
          districtCode: data.address.districtCode || null,
          districtName: data.address.districtName || null,
          villageCode: data.address.villageCode || null,
          villageName: data.address.villageName || null,
          line1: line1Val,
          fullAddress: fullAddressVal,
          isPrimary: true,
        });
      }
    }

    // Sync name change to canonical users and Better Auth user tables
    if (data.fullName !== undefined && updated.userId) {
      const now = new Date().toISOString();
      await this.db
        .update(users)
        .set({ name: data.fullName, updatedAt: now })
        .where(eq(users.id, updated.userId));
      try {
        await this.db
          .update(user)
          .set({ name: data.fullName, updatedAt: now as any })
          .where(eq(user.id, updated.userId));
      } catch {
        // Better Auth parity non-blocking
      }
    }

    return this.findById(id);
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

  async findCredentialById(credentialId: string): Promise<any | null> {
    const record = await this.db.query.staffCredentials.findFirst({
      where: eq(staffCredentials.id, credentialId),
    });
    if (!record) return null;
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
      updatedAt: record.updatedAt,
    };
  }

  async updateCredential(
    credentialId: string,
    credential: any,
  ): Promise<any | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (credential.credentialType !== undefined) {
      updateValues.credentialType = credential.credentialType;
    }
    if (credential.credentialNumber !== undefined) {
      updateValues.credentialNumberHash = credential.credentialNumber;
      updateValues.credentialNumberEncrypted = credential.credentialNumber;
    }
    if (credential.issuer !== undefined) {
      updateValues.issuer = credential.issuer;
    }
    if (credential.issuedAt !== undefined) {
      updateValues.issuedAt = credential.issuedAt;
    }
    if (credential.expiresAt !== undefined) {
      updateValues.expiresAt = credential.expiresAt;
    }
    if (credential.status !== undefined) {
      updateValues.status = credential.status;
    }

    const [updated] = await this.db
      .update(staffCredentials)
      .set(updateValues)
      .where(eq(staffCredentials.id, credentialId))
      .returning();

    if (!updated) return null;

    return {
      id: updated.id,
      staffProfileId: updated.staffProfileId,
      credentialType: updated.credentialType,
      credentialNumber:
        updated.credentialNumberEncrypted || updated.credentialNumberHash,
      issuer: updated.issuer,
      issuedAt: updated.issuedAt,
      expiresAt: updated.expiresAt,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteCredential(credentialId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(staffCredentials)
      .where(eq(staffCredentials.id, credentialId))
      .returning();
    return Boolean(deleted);
  }
}

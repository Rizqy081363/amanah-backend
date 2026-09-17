import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffProfiles } from '../../../../database/schema';
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

    const [record] = await this.db
      .insert(staffProfiles)
      .values({
        userId: data.userId || null,
        primaryUnitId: data.poliklinikId || null,
        fullName: data.fullName,
        positionTitle: data.profession,
        staffCode: data.idCardNumber,
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
    const records = await this.db.query.staffProfiles.findMany();
    return records.map((r) => this.mapRecordToEntity(r));
  }
}

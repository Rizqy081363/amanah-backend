import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { StaffRepository } from '../../domain/repositories/staff.repository';
import { StaffEntity } from '../../domain/entities/staff.entity';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffs } from '../../../../database/schema';

@Injectable()
export class StaffDrizzleRepository implements StaffRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(
    data: Omit<StaffEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StaffEntity> {
    const [record] = await this.db
      .insert(staffs)
      .values({
        userId: data.userId,
        poliklinikId: data.poliklinikId,
        fullName: data.fullName,
        profession: data.profession,
        idCardNumber: data.idCardNumber,
        photoUrl: data.photoUrl,
        phoneNumber: data.phoneNumber,
        isActive: data.isActive,
      })
      .returning();

    return record as StaffEntity;
  }

  async findById(id: string): Promise<StaffEntity | null> {
    const record = await this.db.query.staffs.findFirst({
      where: eq(staffs.id, id),
    });
    return (record as StaffEntity) || null;
  }

  async findByUserId(userId: number): Promise<StaffEntity | null> {
    const record = await this.db.query.staffs.findFirst({
      where: eq(staffs.userId, userId),
    });
    return (record as StaffEntity) || null;
  }

  async findByCardNumber(cardNum: string): Promise<StaffEntity | null> {
    const record = await this.db.query.staffs.findFirst({
      where: eq(staffs.idCardNumber, cardNum),
    });
    return (record as StaffEntity) || null;
  }

  async findByProfession(profession: string): Promise<StaffEntity[]> {
    const records = await this.db.query.staffs.findMany({
      where: eq(staffs.profession, profession),
    });
    return records as StaffEntity[];
  }

  async findByPoliklinik(poliId: string): Promise<StaffEntity[]> {
    const records = await this.db.query.staffs.findMany({
      where: eq(staffs.poliklinikId, poliId),
    });
    return records as StaffEntity[];
  }

  async findAll(): Promise<StaffEntity[]> {
    const records = await this.db.query.staffs.findMany();
    return records as StaffEntity[];
  }
}

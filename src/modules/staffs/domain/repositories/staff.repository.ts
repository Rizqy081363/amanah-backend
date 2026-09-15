import { StaffEntity } from '../entities/staff.entity';

export const STAFF_REPOSITORY = 'STAFF_REPOSITORY';

export interface StaffRepository {
  create(data: Omit<StaffEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<StaffEntity>;
  findById(id: string): Promise<StaffEntity | null>;
  findByUserId(userId: number): Promise<StaffEntity | null>;
  findByCardNumber(cardNum: string): Promise<StaffEntity | null>;
  findByProfession(profession: string): Promise<StaffEntity[]>;
  findByPoliklinik(poliId: string): Promise<StaffEntity[]>;
  findAll(): Promise<StaffEntity[]>;
}

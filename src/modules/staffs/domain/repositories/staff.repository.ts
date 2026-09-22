import { StaffEntity } from '../entities/staff.entity';

export const STAFF_REPOSITORY = 'STAFF_REPOSITORY';

export interface StaffRepository {
  create(
    data: Omit<StaffEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StaffEntity>;
  findById(id: string): Promise<StaffEntity | null>;
  findByUserId(userId: string): Promise<StaffEntity | null>;
  findByCardNumber(cardNum: string): Promise<StaffEntity | null>;
  findByProfession(profession: string): Promise<StaffEntity[]>;
  findByPoliklinik(poliId: string): Promise<StaffEntity[]>;
  findAll(): Promise<StaffEntity[]>;
  update(id: string, data: Partial<StaffEntity>): Promise<StaffEntity | null>;
  delete(id: string): Promise<boolean>;
  findCredentials(staffId: string): Promise<any[]>;
  findCredentialById(credentialId: string): Promise<any | null>;
  addCredential(staffId: string, credential: any): Promise<any>;
  updateCredential(credentialId: string, credential: any): Promise<any | null>;
  deleteCredential(credentialId: string): Promise<boolean>;
}

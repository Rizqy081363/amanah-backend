import { StaffEntity } from '../entities/staff.entity';

export const STAFF_REPOSITORY = 'STAFF_REPOSITORY';

export abstract class StaffRepository {
  abstract create(
    data: Omit<StaffEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StaffEntity>;
  abstract findById(id: string): Promise<StaffEntity | null>;
  abstract findByUserId(userId: string): Promise<StaffEntity | null>;
  abstract findByCardNumber(cardNum: string): Promise<StaffEntity | null>;
  abstract findByProfession(profession: string): Promise<StaffEntity[]>;
  abstract findByPoliklinik(poliId: string): Promise<StaffEntity[]>;
  abstract findAll(): Promise<StaffEntity[]>;
  abstract update(
    id: string,
    data: Partial<StaffEntity>,
  ): Promise<StaffEntity | null>;
  abstract delete(id: string): Promise<boolean>;
  abstract findCredentials(staffId: string): Promise<any[]>;
  abstract findCredentialById(credentialId: string): Promise<any | null>;
  abstract addCredential(staffId: string, credential: any): Promise<any>;
  abstract updateCredential(
    credentialId: string,
    credential: any,
  ): Promise<any | null>;
  abstract deleteCredential(credentialId: string): Promise<boolean>;
}

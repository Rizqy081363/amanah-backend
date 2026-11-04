import type { BloodTypeEntity } from '../entities/blood-type.entity';

export const BLOOD_TYPE_REPOSITORY = Symbol('BLOOD_TYPE_REPOSITORY');

export interface CreateBloodTypeData {
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateBloodTypeData {
  name?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface IBloodTypeRepository {
  findAll(options?: { activeOnly?: boolean; search?: string }): Promise<BloodTypeEntity[]>;
  findById(id: string): Promise<BloodTypeEntity | null>;
  findByName(name: string): Promise<BloodTypeEntity | null>;
  create(data: CreateBloodTypeData): Promise<BloodTypeEntity>;
  update(id: string, data: UpdateBloodTypeData): Promise<BloodTypeEntity>;
  delete(id: string): Promise<void>;
}

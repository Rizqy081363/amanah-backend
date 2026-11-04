import type { BloodTypeEntity } from '../entities/blood-type.entity';

export const BLOOD_TYPE_REPOSITORY = Symbol('BLOOD_TYPE_REPOSITORY');

export function composeBloodTypeCode(name: string): string {
  const clean = name.trim().toLowerCase();
  if (clean === 'tidak tahu' || clean === 'unknown' || clean === 'belum tahu') {
    return 'unknown';
  }
  return clean
    .replace(/\+/g, '_positive')
    .replace(/-/g, '_negative')
    .replace(/\s+/g, '_');
}

export interface CreateBloodTypeData {
  code?: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateBloodTypeData {
  code?: string;
  name?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface IBloodTypeRepository {
  findAll(options?: { activeOnly?: boolean; search?: string }): Promise<BloodTypeEntity[]>;
  findById(id: string): Promise<BloodTypeEntity | null>;
  findByName(name: string): Promise<BloodTypeEntity | null>;
  findByCode(code: string): Promise<BloodTypeEntity | null>;
  create(data: CreateBloodTypeData): Promise<BloodTypeEntity>;
  update(id: string, data: UpdateBloodTypeData): Promise<BloodTypeEntity>;
  delete(id: string): Promise<void>;
}

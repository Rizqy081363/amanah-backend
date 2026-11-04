import type { ReligionEntity } from '../entities/religion.entity';

export const RELIGION_REPOSITORY = Symbol('RELIGION_REPOSITORY');

export interface CreateReligionData {
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateReligionData {
  name?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface IReligionRepository {
  findAll(options?: { activeOnly?: boolean; search?: string }): Promise<ReligionEntity[]>;
  findById(id: string): Promise<ReligionEntity | null>;
  findByName(name: string): Promise<ReligionEntity | null>;
  create(data: CreateReligionData): Promise<ReligionEntity>;
  update(id: string, data: UpdateReligionData): Promise<ReligionEntity>;
  delete(id: string): Promise<void>;
}

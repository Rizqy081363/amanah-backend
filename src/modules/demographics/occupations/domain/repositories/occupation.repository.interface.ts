import type { OccupationEntity } from '../entities/occupation.entity';

export const OCCUPATION_REPOSITORY = Symbol('OCCUPATION_REPOSITORY');

export interface CreateOccupationData {
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateOccupationData {
  name?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface IOccupationRepository {
  findAll(options?: { activeOnly?: boolean; search?: string }): Promise<OccupationEntity[]>;
  findById(id: string): Promise<OccupationEntity | null>;
  findByName(name: string): Promise<OccupationEntity | null>;
  create(data: CreateOccupationData): Promise<OccupationEntity>;
  update(id: string, data: UpdateOccupationData): Promise<OccupationEntity>;
  delete(id: string): Promise<void>;
}

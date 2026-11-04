import type { EducationLevelEntity } from '../entities/education-level.entity';

export const EDUCATION_LEVEL_REPOSITORY = Symbol('EDUCATION_LEVEL_REPOSITORY');

export interface CreateEducationLevelData {
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateEducationLevelData {
  name?: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface IEducationLevelRepository {
  findAll(options?: { activeOnly?: boolean; search?: string }): Promise<EducationLevelEntity[]>;
  findById(id: string): Promise<EducationLevelEntity | null>;
  findByName(name: string): Promise<EducationLevelEntity | null>;
  create(data: CreateEducationLevelData): Promise<EducationLevelEntity>;
  update(id: string, data: UpdateEducationLevelData): Promise<EducationLevelEntity>;
  delete(id: string): Promise<void>;
}

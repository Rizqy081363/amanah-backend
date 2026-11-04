import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EDUCATION_LEVEL_REPOSITORY,
  type IEducationLevelRepository,
  type UpdateEducationLevelData,
} from '../repositories/education-level.repository.interface';
import type { EducationLevelEntity } from '../entities/education-level.entity';

@Injectable()
export class UpdateEducationLevelUseCase {
  constructor(
    @Inject(EDUCATION_LEVEL_REPOSITORY)
    private readonly repository: IEducationLevelRepository,
  ) {}

  async execute(id: string, data: UpdateEducationLevelData): Promise<EducationLevelEntity> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Jenjang pendidikan dengan ID "${id}" tidak ditemukan`);
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await this.repository.findByName(data.name);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Jenjang pendidikan dengan nama "${data.name}" sudah ada`);
      }
    }

    return this.repository.update(id, data);
  }
}

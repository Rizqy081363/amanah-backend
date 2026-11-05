import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  EDUCATION_LEVEL_REPOSITORY,
  type CreateEducationLevelData,
  type IEducationLevelRepository,
} from '../repositories/education-level.repository.interface';
import type { EducationLevelEntity } from '../entities/education-level.entity';

@Injectable()
export class CreateEducationLevelUseCase {
  constructor(
    @Inject(EDUCATION_LEVEL_REPOSITORY)
    private readonly repository: IEducationLevelRepository,
  ) {}

  async execute(data: CreateEducationLevelData): Promise<EducationLevelEntity> {
    const cleanName = data.name.trim();
    const existing = await this.repository.findByName(cleanName);
    if (existing) {
      throw new ConflictException(`Jenjang pendidikan '${existing.name}' sudah terdaftar.`);
    }
    return this.repository.create({ ...data, name: cleanName });
  }
}

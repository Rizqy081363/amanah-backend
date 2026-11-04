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
    const existing = await this.repository.findByName(data.name);
    if (existing) {
      throw new ConflictException(`Jenjang pendidikan dengan nama "${data.name}" sudah ada`);
    }
    return this.repository.create(data);
  }
}

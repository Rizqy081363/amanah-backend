import { Inject, Injectable } from '@nestjs/common';
import {
  EDUCATION_LEVEL_REPOSITORY,
  type IEducationLevelRepository,
} from '../repositories/education-level.repository.interface';
import type { EducationLevelEntity } from '../entities/education-level.entity';

@Injectable()
export class GetAllEducationLevelsUseCase {
  constructor(
    @Inject(EDUCATION_LEVEL_REPOSITORY)
    private readonly repository: IEducationLevelRepository,
  ) {}

  async execute(options?: { activeOnly?: boolean; search?: string }): Promise<EducationLevelEntity[]> {
    return this.repository.findAll(options);
  }
}

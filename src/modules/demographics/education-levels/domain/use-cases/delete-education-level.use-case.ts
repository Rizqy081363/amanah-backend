import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EDUCATION_LEVEL_REPOSITORY,
  type IEducationLevelRepository,
} from '../repositories/education-level.repository.interface';

@Injectable()
export class DeleteEducationLevelUseCase {
  constructor(
    @Inject(EDUCATION_LEVEL_REPOSITORY)
    private readonly repository: IEducationLevelRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Jenjang pendidikan dengan ID "${id}" tidak ditemukan`);
    }

    if (existing.isSystem) {
      throw new ForbiddenException('Jenjang pendidikan bawaan sistem tidak dapat dihapus');
    }

    await this.repository.delete(id);
  }
}

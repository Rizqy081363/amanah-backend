import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  RELIGION_REPOSITORY,
  type IReligionRepository,
} from '../repositories/religion.repository.interface';

@Injectable()
export class DeleteReligionUseCase {
  constructor(
    @Inject(RELIGION_REPOSITORY)
    private readonly repository: IReligionRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Agama dengan ID "${id}" tidak ditemukan`);
    }

    if (existing.isSystem) {
      throw new ForbiddenException('Agama bawaan sistem tidak dapat dihapus');
    }

    await this.repository.delete(id);
  }
}

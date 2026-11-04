import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  RELIGION_REPOSITORY,
  type IReligionRepository,
  type UpdateReligionData,
} from '../repositories/religion.repository.interface';
import type { ReligionEntity } from '../entities/religion.entity';

@Injectable()
export class UpdateReligionUseCase {
  constructor(
    @Inject(RELIGION_REPOSITORY)
    private readonly repository: IReligionRepository,
  ) {}

  async execute(id: string, data: UpdateReligionData): Promise<ReligionEntity> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Agama dengan ID "${id}" tidak ditemukan`);
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await this.repository.findByName(data.name);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Agama dengan nama "${data.name}" sudah ada`);
      }
    }

    return this.repository.update(id, data);
  }
}

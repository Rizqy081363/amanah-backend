import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  OCCUPATION_REPOSITORY,
  type IOccupationRepository,
  type UpdateOccupationData,
} from '../repositories/occupation.repository.interface';
import type { OccupationEntity } from '../entities/occupation.entity';

@Injectable()
export class UpdateOccupationUseCase {
  constructor(
    @Inject(OCCUPATION_REPOSITORY)
    private readonly repository: IOccupationRepository,
  ) {}

  async execute(id: string, data: UpdateOccupationData): Promise<OccupationEntity> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Pekerjaan dengan ID "${id}" tidak ditemukan`);
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await this.repository.findByName(data.name);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Pekerjaan dengan nama "${data.name}" sudah ada`);
      }
    }

    return this.repository.update(id, data);
  }
}

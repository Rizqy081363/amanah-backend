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

    const cleanName = data.name !== undefined ? data.name.trim() : undefined;
    if (cleanName && cleanName.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await this.repository.findByName(cleanName);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Pekerjaan '${duplicate.name}' sudah terdaftar.`);
      }
    }

    return this.repository.update(id, {
      ...data,
      name: cleanName ?? data.name,
    });
  }
}

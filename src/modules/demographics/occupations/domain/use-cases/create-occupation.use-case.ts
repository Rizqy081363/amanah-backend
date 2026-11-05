import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  OCCUPATION_REPOSITORY,
  type CreateOccupationData,
  type IOccupationRepository,
} from '../repositories/occupation.repository.interface';
import type { OccupationEntity } from '../entities/occupation.entity';

@Injectable()
export class CreateOccupationUseCase {
  constructor(
    @Inject(OCCUPATION_REPOSITORY)
    private readonly repository: IOccupationRepository,
  ) {}

  async execute(data: CreateOccupationData): Promise<OccupationEntity> {
    const cleanName = data.name.trim();
    const existing = await this.repository.findByName(cleanName);
    if (existing) {
      throw new ConflictException(`Pekerjaan '${existing.name}' sudah terdaftar.`);
    }
    return this.repository.create({ ...data, name: cleanName });
  }
}

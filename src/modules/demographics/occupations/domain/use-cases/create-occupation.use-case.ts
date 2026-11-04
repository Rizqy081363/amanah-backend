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
    const existing = await this.repository.findByName(data.name);
    if (existing) {
      throw new ConflictException(`Pekerjaan dengan nama "${data.name}" sudah ada`);
    }
    return this.repository.create(data);
  }
}

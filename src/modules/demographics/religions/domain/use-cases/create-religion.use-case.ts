import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  RELIGION_REPOSITORY,
  type CreateReligionData,
  type IReligionRepository,
} from '../repositories/religion.repository.interface';
import type { ReligionEntity } from '../entities/religion.entity';

@Injectable()
export class CreateReligionUseCase {
  constructor(
    @Inject(RELIGION_REPOSITORY)
    private readonly repository: IReligionRepository,
  ) {}

  async execute(data: CreateReligionData): Promise<ReligionEntity> {
    const existing = await this.repository.findByName(data.name);
    if (existing) {
      throw new ConflictException(`Agama dengan nama "${data.name}" sudah ada`);
    }
    return this.repository.create(data);
  }
}

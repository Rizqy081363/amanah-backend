import { Inject, Injectable } from '@nestjs/common';
import {
  RELIGION_REPOSITORY,
  type IReligionRepository,
} from '../repositories/religion.repository.interface';
import type { ReligionEntity } from '../entities/religion.entity';

@Injectable()
export class GetAllReligionsUseCase {
  constructor(
    @Inject(RELIGION_REPOSITORY)
    private readonly repository: IReligionRepository,
  ) {}

  async execute(options?: { activeOnly?: boolean; search?: string }): Promise<ReligionEntity[]> {
    return this.repository.findAll(options);
  }
}

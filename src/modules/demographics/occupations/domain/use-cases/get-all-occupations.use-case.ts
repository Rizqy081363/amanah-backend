import { Inject, Injectable } from '@nestjs/common';
import {
  OCCUPATION_REPOSITORY,
  type IOccupationRepository,
} from '../repositories/occupation.repository.interface';
import type { OccupationEntity } from '../entities/occupation.entity';

@Injectable()
export class GetAllOccupationsUseCase {
  constructor(
    @Inject(OCCUPATION_REPOSITORY)
    private readonly repository: IOccupationRepository,
  ) {}

  async execute(options?: { activeOnly?: boolean; search?: string }): Promise<OccupationEntity[]> {
    return this.repository.findAll(options);
  }
}

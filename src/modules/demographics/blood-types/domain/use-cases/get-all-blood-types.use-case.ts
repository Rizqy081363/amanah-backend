import { Inject, Injectable } from '@nestjs/common';
import {
  BLOOD_TYPE_REPOSITORY,
  type IBloodTypeRepository,
} from '../repositories/blood-type.repository.interface';
import type { BloodTypeEntity } from '../entities/blood-type.entity';

@Injectable()
export class GetAllBloodTypesUseCase {
  constructor(
    @Inject(BLOOD_TYPE_REPOSITORY)
    private readonly repository: IBloodTypeRepository,
  ) {}

  async execute(options?: { activeOnly?: boolean; search?: string }): Promise<BloodTypeEntity[]> {
    return this.repository.findAll(options);
  }
}

import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  BLOOD_TYPE_REPOSITORY,
  type CreateBloodTypeData,
  type IBloodTypeRepository,
} from '../repositories/blood-type.repository.interface';
import type { BloodTypeEntity } from '../entities/blood-type.entity';

@Injectable()
export class CreateBloodTypeUseCase {
  constructor(
    @Inject(BLOOD_TYPE_REPOSITORY)
    private readonly repository: IBloodTypeRepository,
  ) {}

  async execute(data: CreateBloodTypeData): Promise<BloodTypeEntity> {
    const existing = await this.repository.findByName(data.name);
    if (existing) {
      throw new ConflictException(`Golongan darah dengan nama "${data.name}" sudah ada`);
    }
    return this.repository.create(data);
  }
}

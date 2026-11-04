import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  BLOOD_TYPE_REPOSITORY,
  composeBloodTypeCode,
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
    const existingName = await this.repository.findByName(data.name);
    if (existingName) {
      throw new ConflictException(`Golongan darah dengan nama "${data.name}" sudah ada`);
    }

    const resolvedCode = data.code || composeBloodTypeCode(data.name);
    const existingCode = await this.repository.findByCode(resolvedCode);
    if (existingCode) {
      throw new ConflictException(`Golongan darah dengan kode "${resolvedCode}" sudah ada`);
    }

    return this.repository.create({
      ...data,
      code: resolvedCode,
    });
  }
}

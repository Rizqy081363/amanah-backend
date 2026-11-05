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
    const cleanName = data.name.trim().toUpperCase();
    const existingName = await this.repository.findByName(cleanName);
    if (existingName) {
      throw new ConflictException(`Golongan darah '${existingName.name}' sudah terdaftar.`);
    }

    const resolvedCode = data.code || composeBloodTypeCode(cleanName);
    const existingCode = await this.repository.findByCode(resolvedCode);
    if (existingCode) {
      throw new ConflictException(`Golongan darah '${existingCode.name}' sudah terdaftar.`);
    }

    return this.repository.create({
      ...data,
      name: cleanName,
      code: resolvedCode,
    });
  }
}

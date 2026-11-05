import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BLOOD_TYPE_REPOSITORY,
  composeBloodTypeCode,
  type IBloodTypeRepository,
  type UpdateBloodTypeData,
} from '../repositories/blood-type.repository.interface';
import type { BloodTypeEntity } from '../entities/blood-type.entity';

@Injectable()
export class UpdateBloodTypeUseCase {
  constructor(
    @Inject(BLOOD_TYPE_REPOSITORY)
    private readonly repository: IBloodTypeRepository,
  ) {}

  async execute(id: string, data: UpdateBloodTypeData): Promise<BloodTypeEntity> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Golongan darah dengan ID "${id}" tidak ditemukan`);
    }

    const cleanName = data.name !== undefined ? data.name.trim().toUpperCase() : undefined;
    if (cleanName && cleanName !== existing.name.toUpperCase()) {
      const duplicate = await this.repository.findByName(cleanName);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Golongan darah '${duplicate.name}' sudah terdaftar.`);
      }
    }

    const targetCode = data.code || (cleanName ? composeBloodTypeCode(cleanName) : undefined);
    if (targetCode && targetCode !== existing.code) {
      const duplicateCode = await this.repository.findByCode(targetCode);
      if (duplicateCode && duplicateCode.id !== id) {
        throw new ConflictException(`Golongan darah '${duplicateCode.name}' sudah terdaftar.`);
      }
    }

    return this.repository.update(id, {
      ...data,
      name: cleanName ?? data.name,
      code: targetCode ?? data.code,
    });
  }
}

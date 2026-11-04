import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BLOOD_TYPE_REPOSITORY,
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

    if (data.name && data.name !== existing.name) {
      const duplicate = await this.repository.findByName(data.name);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(`Golongan darah dengan nama "${data.name}" sudah ada`);
      }
    }

    return this.repository.update(id, data);
  }
}

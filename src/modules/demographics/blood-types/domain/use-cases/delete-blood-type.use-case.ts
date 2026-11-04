import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BLOOD_TYPE_REPOSITORY,
  type IBloodTypeRepository,
} from '../repositories/blood-type.repository.interface';

@Injectable()
export class DeleteBloodTypeUseCase {
  constructor(
    @Inject(BLOOD_TYPE_REPOSITORY)
    private readonly repository: IBloodTypeRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Golongan darah dengan ID "${id}" tidak ditemukan`);
    }

    if (existing.isSystem) {
      throw new ForbiddenException('Golongan darah bawaan sistem tidak dapat dihapus');
    }

    await this.repository.delete(id);
  }
}

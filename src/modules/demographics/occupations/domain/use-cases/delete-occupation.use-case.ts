import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  OCCUPATION_REPOSITORY,
  type IOccupationRepository,
} from '../repositories/occupation.repository.interface';

@Injectable()
export class DeleteOccupationUseCase {
  constructor(
    @Inject(OCCUPATION_REPOSITORY)
    private readonly repository: IOccupationRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Pekerjaan dengan ID "${id}" tidak ditemukan`);
    }

    await this.repository.delete(id);
  }
}

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  MATERNITY_REPOSITORY,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';
import { UpdateMaternityIntakeDto } from '../../presentation/dto/update-maternity-intake.dto';

@Injectable()
export class UpdateMaternityIntakeUseCase {
  constructor(
    @Inject(MATERNITY_REPOSITORY)
    private readonly maternityRepo: MaternityRepository,
  ) {}

  async execute(
    id: string,
    dto: UpdateMaternityIntakeDto,
  ): Promise<MaternityIntakeEntity> {
    const updated = await this.maternityRepo.update(id, dto);
    if (!updated) {
      throw new NotFoundException(
        `Data intake kehamilan dengan ID ${id} tidak ditemukan`,
      );
    }
    return updated;
  }
}

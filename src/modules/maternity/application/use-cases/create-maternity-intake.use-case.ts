import { Inject, Injectable } from '@nestjs/common';
import {
  MATERNITY_REPOSITORY,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';
import { CreateMaternityIntakeDto } from '../../presentation/dto/create-maternity-intake.dto';

@Injectable()
export class CreateMaternityIntakeUseCase {
  constructor(
    @Inject(MATERNITY_REPOSITORY)
    private readonly maternityRepo: MaternityRepository,
  ) {}

  async execute(
    dto: CreateMaternityIntakeDto,
    submittedByUserId?: string,
  ): Promise<MaternityIntakeEntity> {
    return this.maternityRepo.create(dto, submittedByUserId);
  }
}

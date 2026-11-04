import { Inject, Injectable } from '@nestjs/common';
import {
  CreateImmunizationIntakeData,
  IImmunizationRepository,
  IMMUNIZATION_REPOSITORY,
} from '../../domain/repositories/immunization.repository.interface';
import { ChildImmunizationIntakeEntity } from '../../domain/entities/immunization-record.entity';

@Injectable()
export class CreateImmunizationIntakeUseCase {
  constructor(
    @Inject(IMMUNIZATION_REPOSITORY)
    private readonly immunizationRepo: IImmunizationRepository,
  ) {}

  async execute(
    data: CreateImmunizationIntakeData,
    submittedByUserId?: string,
  ): Promise<ChildImmunizationIntakeEntity> {
    return this.immunizationRepo.createIntake(data, submittedByUserId);
  }
}

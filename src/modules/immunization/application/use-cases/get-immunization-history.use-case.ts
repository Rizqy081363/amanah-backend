import { Inject, Injectable } from '@nestjs/common';
import {
  IImmunizationRepository,
  IMMUNIZATION_REPOSITORY,
  ImmunizationHistoryQuery,
  PaginatedImmunizationHistory,
} from '../../domain/repositories/immunization.repository.interface';

@Injectable()
export class GetImmunizationHistoryUseCase {
  constructor(
    @Inject(IMMUNIZATION_REPOSITORY)
    private readonly immunizationRepo: IImmunizationRepository,
  ) {}

  async execute(
    query: ImmunizationHistoryQuery,
  ): Promise<PaginatedImmunizationHistory> {
    return this.immunizationRepo.findHistory(query);
  }
}

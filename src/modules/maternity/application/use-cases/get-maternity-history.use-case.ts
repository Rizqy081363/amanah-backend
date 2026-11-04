import { Inject, Injectable } from '@nestjs/common';
import {
  MATERNITY_REPOSITORY,
  MaternityHistoryQuery,
  MaternityHistoryResult,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';

@Injectable()
export class GetMaternityHistoryUseCase {
  constructor(
    @Inject(MATERNITY_REPOSITORY)
    private readonly maternityRepo: MaternityRepository,
  ) {}

  async execute(
    patientIds: string[],
    query: MaternityHistoryQuery,
  ): Promise<MaternityHistoryResult> {
    return this.maternityRepo.findMaternalHistory(patientIds, query);
  }

  async executeByPatientId(patientId: string): Promise<MaternityIntakeEntity[]> {
    return this.maternityRepo.findByPatientId(patientId);
  }
}

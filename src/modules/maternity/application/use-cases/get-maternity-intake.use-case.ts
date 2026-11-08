import { Inject, Injectable } from '@nestjs/common';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';
import { MaternityIntakeNotFoundError } from '../../domain/errors/maternity.errors';
import {
  MATERNITY_REPOSITORY,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';

@Injectable()
export class GetMaternityIntakeUseCase {
  constructor(
    @Inject(MATERNITY_REPOSITORY)
    private readonly maternityRepo: MaternityRepository,
  ) {}

  async executeById(id: string): Promise<MaternityIntakeEntity> {
    const intake = await this.maternityRepo.findById(id);
    if (!intake) {
      throw new MaternityIntakeNotFoundError(id);
    }
    return intake;
  }

  async executeByAppointmentId(
    appointmentId: string,
  ): Promise<MaternityIntakeEntity> {
    const intake = await this.maternityRepo.findByAppointmentId(appointmentId);
    if (!intake) {
      throw new MaternityIntakeNotFoundError(appointmentId);
    }
    return intake;
  }
}

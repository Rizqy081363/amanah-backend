import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  MATERNITY_REPOSITORY,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';

@Injectable()
export class GetMaternityIntakeUseCase {
  constructor(
    @Inject(MATERNITY_REPOSITORY)
    private readonly maternityRepo: MaternityRepository,
  ) {}

  async executeById(id: string): Promise<MaternityIntakeEntity> {
    const intake = await this.maternityRepo.findById(id);
    if (!intake) {
      throw new NotFoundException(
        `Data intake kehamilan dengan ID ${id} tidak ditemukan`,
      );
    }
    return intake;
  }

  async executeByAppointmentId(
    appointmentId: string,
  ): Promise<MaternityIntakeEntity> {
    const intake = await this.maternityRepo.findByAppointmentId(appointmentId);
    if (!intake) {
      throw new NotFoundException(
        `Data intake kehamilan untuk appointment ${appointmentId} tidak ditemukan`,
      );
    }
    return intake;
  }
}

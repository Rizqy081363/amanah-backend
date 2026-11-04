import { Inject, Injectable } from '@nestjs/common';
import {
  IImmunizationRepository,
  IMMUNIZATION_REPOSITORY,
} from '../../domain/repositories/immunization.repository.interface';
import { ChildImmunizationClinicalEntryEntity } from '../../domain/entities/immunization-record.entity';

@Injectable()
export class GetChildImmunizationLedgerUseCase {
  constructor(
    @Inject(IMMUNIZATION_REPOSITORY)
    private readonly immunizationRepo: IImmunizationRepository,
  ) {}

  async execute(
    patientId: string,
  ): Promise<ChildImmunizationClinicalEntryEntity[]> {
    return this.immunizationRepo.findChildCumulativeLedger(patientId);
  }

  async executeByIntakeId(id: string): Promise<any | null> {
    return this.immunizationRepo.findIntakeById(id);
  }

  async executeByAppointmentId(appointmentId: string): Promise<any | null> {
    return this.immunizationRepo.findIntakeByAppointmentId(appointmentId);
  }
}

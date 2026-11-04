import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IImmunizationRepository,
  IMMUNIZATION_REPOSITORY,
  SaveClinicalEntryData,
  UpdateImmunizationIntakeData,
} from '../../domain/repositories/immunization.repository.interface';
import {
  ChildImmunizationClinicalEntryEntity,
  ChildImmunizationIntakeEntity,
} from '../../domain/entities/immunization-record.entity';

@Injectable()
export class UpdateImmunizationEntryUseCase {
  constructor(
    @Inject(IMMUNIZATION_REPOSITORY)
    private readonly immunizationRepo: IImmunizationRepository,
  ) {}

  async executeIntakeUpdate(
    id: string,
    data: UpdateImmunizationIntakeData,
  ): Promise<ChildImmunizationIntakeEntity> {
    const updated = await this.immunizationRepo.updateIntake(id, data);
    if (!updated) {
      throw new NotFoundException('Data formulir imunisasi tidak ditemukan.');
    }
    return updated;
  }

  async executeClinicalEntriesUpsert(
    patientId: string,
    intakeId: string,
    entries: SaveClinicalEntryData[],
    appointmentId?: string | null,
    administeredBy?: string | null,
  ): Promise<ChildImmunizationClinicalEntryEntity[]> {
    return this.immunizationRepo.upsertClinicalEntries(
      patientId,
      intakeId,
      entries,
      appointmentId,
      administeredBy,
    );
  }
}

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
import {
  PATIENT_REPOSITORY,
  type PatientRepository,
} from '../../../patients/domain/repositories/patient.repository';

@Injectable()
export class UpdateImmunizationEntryUseCase {
  constructor(
    @Inject(IMMUNIZATION_REPOSITORY)
    private readonly immunizationRepo: IImmunizationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: PatientRepository,
  ) {}

  async executeIntakeUpdate(
    id: string,
    data: UpdateImmunizationIntakeData,
  ): Promise<ChildImmunizationIntakeEntity> {
    const updated = await this.immunizationRepo.updateIntake(id, data);
    if (!updated) {
      throw new NotFoundException('Data formulir imunisasi tidak ditemukan.');
    }

    if (updated.patientId) {
      const patientPatch: Record<string, any> = {};
      if (data.childName !== undefined) patientPatch.fullName = data.childName ? data.childName.trim() : '';
      if (data.childNik !== undefined) patientPatch.nik = data.childNik ? data.childNik.trim() : null;
      if (data.childBirthDate !== undefined) patientPatch.birthDate = data.childBirthDate;
      if (data.childSex !== undefined) patientPatch.gender = data.childSex;
      if (data.parentPhone !== undefined) patientPatch.phone = data.parentPhone;
      if (data.motherName !== undefined) patientPatch.motherName = data.motherName;
      if (data.childAddress !== undefined) patientPatch.fullAddress = data.childAddress;
      if (data.line1 !== undefined) patientPatch.line1 = data.line1;
      if (data.provinceCode !== undefined) patientPatch.provinceCode = data.provinceCode;
      if (data.provinceName !== undefined) patientPatch.provinceName = data.provinceName;
      if (data.regencyCode !== undefined) patientPatch.regencyCode = data.regencyCode;
      if (data.regencyName !== undefined) patientPatch.regencyName = data.regencyName;
      if (data.districtCode !== undefined) patientPatch.districtCode = data.districtCode;
      if (data.districtName !== undefined) patientPatch.districtName = data.districtName;
      if (data.villageCode !== undefined) patientPatch.villageCode = data.villageCode;
      if (data.villageName !== undefined) patientPatch.villageName = data.villageName;

      if (Object.keys(patientPatch).length > 0) {
        await this.patientRepo.update(updated.patientId, patientPatch);
      }
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

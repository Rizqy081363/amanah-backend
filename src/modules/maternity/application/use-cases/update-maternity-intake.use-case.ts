import { Inject, Injectable } from '@nestjs/common';
import { NikSecurityService } from '../../../../common/security/nik';
import { PersistMaternityIntakePatch } from '../../domain/commands/maternity.commands';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';
import { MaternityIntakeNotFoundError } from '../../domain/errors/maternity.errors';
import {
  assertDistinctNiks,
  calculateBmi,
  normalizeNullableString,
  validateDiagnosisYears,
} from '../../domain/policies/maternity-domain.policies';
import {
  MATERNITY_REPOSITORY,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';
import { ObstetricCalculatorService } from '../../domain/services/obstetric-calculator.service';
import { UpdateMaternityIntakeDto } from '../../presentation/dto/update-maternity-intake.dto';

const STRING_FIELDS: readonly (keyof UpdateMaternityIntakeDto)[] = [
  'motherBirthDate',
  'marriageDate',
  'motherJob',
  'motherEducation',
  'religion',
  'phoneNumber',
  'domicileAddress',
  'identityCardAddress',
  'dasawisma',
  'posyandu',
  'puskesmas',
  'partnerName',
  'partnerBirthDate',
  'partnerJob',
  'partnerEducation',
  'partnerBloodType',
  'tetanusStatus',
  'motherBloodType',
  'hpht',
  'smokedBeforePregnancy',
  'concerningEnvironmentNotes',
  'allergyInfo',
  'otherNotes',
] as const;

const SCALAR_FIELDS: readonly (keyof UpdateMaternityIntakeDto)[] = [
  'motherAge',
  'marriageOrder',
  'partnerAge',
  'heightCm',
  'prePregnancyWeightKg',
  'upperArmCircumferenceCm',
  'gravidaCount',
  'parityCount',
  'abortionCount',
  'livingChildrenCount',
  'hasPreviousPregnancyHistory',
  'hasContraceptionHistory',
  'alcoholBeforePregnancy',
  'irregularDietBeforePregnancy',
  'reducedPhysicalActivityBeforePregnancy',
  'unprescribedMedicationBeforePregnancy',
  'concerningCosmeticUseBeforePregnancy',
  'pesticideExposureBeforePregnancy',
  'chemicalExposureBeforePregnancy',
  'smokeExposureBeforePregnancy',
] as const;

@Injectable()
export class UpdateMaternityIntakeUseCase {
  constructor(
    @Inject(MATERNITY_REPOSITORY)
    private readonly maternityRepo: MaternityRepository,
    private readonly obstetricCalculator: ObstetricCalculatorService,
    private readonly nikSecurity: NikSecurityService,
  ) {}

  async execute(
    id: string,
    dto: UpdateMaternityIntakeDto,
  ): Promise<MaternityIntakeEntity> {
    const existing = await this.maternityRepo.findById(id);
    if (!existing) {
      throw new MaternityIntakeNotFoundError(id);
    }

    const effectiveMotherNik =
      dto.motherNik !== undefined
        ? this.nikSecurity.normalize(dto.motherNik) || ''
        : this.nikSecurity.normalize(existing.motherNik) || '';

    const rawPartnerNik =
      dto.partnerNik !== undefined
        ? dto.partnerNik
        : dto.husband?.nik !== undefined
          ? dto.husband.nik
          : undefined;

    const effectivePartnerNik =
      rawPartnerNik !== undefined
        ? this.nikSecurity.normalize(rawPartnerNik) || null
        : this.nikSecurity.normalize(
            existing.partnerNik || existing.husbandProfile?.nik || '',
          ) || null;

    assertDistinctNiks(effectiveMotherNik, effectivePartnerNik);

    const effectiveBirthDate =
      dto.motherBirthDate !== undefined
        ? dto.motherBirthDate
        : existing.motherBirthDate;

    validateDiagnosisYears(dto.healthConditions, effectiveBirthDate);

    let patientIdentitySync: {
      nationalIdEncrypted: string | null;
      nationalIdHash: string | null;
    } | null = null;
    if (dto.motherNik !== undefined) {
      if (effectiveMotherNik && effectiveMotherNik.length === 16) {
        const blindIndex = this.nikSecurity.computeBlindIndex(effectiveMotherNik);
        const secured = this.nikSecurity.secure(effectiveMotherNik);
        if (secured) {
          patientIdentitySync = {
            nationalIdEncrypted: secured.encrypted,
            nationalIdHash: blindIndex,
          };
        }
      } else if (!effectiveMotherNik) {
        patientIdentitySync = {
          nationalIdEncrypted: null,
          nationalIdHash: null,
        };
      }
    }

    let estimatedDueDate: string | null | undefined = dto.estimatedDueDate;
    let gestationalAgeWeeks: number | string | null | undefined =
      dto.gestationalAgeWeeks;
    let gestationalAgeFormatted: string | null | undefined =
      dto.gestationalAgeFormatted;

    if (dto.hpht !== undefined && dto.hpht !== existing.hpht) {
      if (dto.hpht) {
        const calc = this.obstetricCalculator.computeFromHpht(dto.hpht);
        estimatedDueDate = calc.estimatedDueDate;
        gestationalAgeWeeks = calc.gestationalAgeWeeks;
        gestationalAgeFormatted = calc.gestationalAgeFormatted;
      } else {
        estimatedDueDate = null;
        gestationalAgeWeeks = null;
        gestationalAgeFormatted = null;
      }
    }

    let effectiveBmi: number | string | null | undefined = dto.initialBmi;
    if (
      effectiveBmi === undefined &&
      (dto.heightCm !== undefined || dto.prePregnancyWeightKg !== undefined)
    ) {
      const mergedHeight =
        dto.heightCm !== undefined ? dto.heightCm : existing.heightCm;
      const mergedWeight =
        dto.prePregnancyWeightKg !== undefined
          ? dto.prePregnancyWeightKg
          : existing.prePregnancyWeightKg;
      effectiveBmi = calculateBmi(
        mergedHeight !== null && mergedHeight !== undefined
          ? Number(mergedHeight)
          : null,
        mergedWeight !== null && mergedWeight !== undefined
          ? Number(mergedWeight)
          : null,
      );
    }

    const patch: PersistMaternityIntakePatch = {};

    for (const key of STRING_FIELDS) {
      const val = dto[key];
      if (val !== undefined) {
        (patch as Record<string, unknown>)[key] = normalizeNullableString(
          val as string | null,
        );
      }
    }

    for (const key of SCALAR_FIELDS) {
      const val = dto[key];
      if (val !== undefined) {
        (patch as Record<string, unknown>)[key] = val;
      }
    }

    if (dto.motherName !== undefined) patch.motherName = dto.motherName.trim();
    if (dto.motherNik !== undefined) patch.motherNik = effectiveMotherNik || null;
    if (rawPartnerNik !== undefined) patch.partnerNik = effectivePartnerNik;
    if (effectiveBmi !== undefined) patch.initialBmi = effectiveBmi;
    if (estimatedDueDate !== undefined)
      patch.estimatedDueDate = estimatedDueDate;
    if (gestationalAgeWeeks !== undefined)
      patch.gestationalAgeWeeks = gestationalAgeWeeks;
    if (gestationalAgeFormatted !== undefined)
      patch.gestationalAgeFormatted = gestationalAgeFormatted;

    if (dto.currentComplaints !== undefined) {
      patch.currentComplaints = normalizeNullableString(dto.currentComplaints);
      if (existing.appointmentId) {
        patch.appointmentComplaintSync = {
          appointmentId: existing.appointmentId,
          complaint: patch.currentComplaints,
        };
      }
    }

    if (dto.husband !== undefined) {
      patch.husband = dto.husband?.fullName
        ? {
            fullName: dto.husband.fullName.trim(),
            nik: effectivePartnerNik,
            birthDate: normalizeNullableString(dto.husband.birthDate),
            age: dto.husband.age || null,
            job: normalizeNullableString(dto.husband.job),
            education: normalizeNullableString(dto.husband.education),
            bloodType: normalizeNullableString(dto.husband.bloodType),
            phoneNumber: normalizeNullableString(dto.husband.phoneNumber),
          }
        : null;
    }

    if (dto.previousPregnancies !== undefined) {
      patch.previousPregnancies = dto.previousPregnancies.map((p, idx) => ({
        orderNumber: p.orderNumber || idx + 1,
        birthYear: normalizeNullableString(p.birthYear),
        birthWeightGrams: p.birthWeightGrams || null,
        birthLengthCm: p.birthLengthCm || null,
        childSex: normalizeNullableString(p.childSex),
        gestationalAgeAtBirth: normalizeNullableString(p.gestationalAgeAtBirth),
        birthAttendant: normalizeNullableString(p.birthAttendant),
        deliveryMethod: normalizeNullableString(p.deliveryMethod),
        deliveryPlace: normalizeNullableString(p.deliveryPlace),
        complications: normalizeNullableString(p.complications),
      }));
    }

    if (dto.contraceptiveHistories !== undefined) {
      patch.contraceptiveHistories = dto.contraceptiveHistories.map(
        (c, idx) => ({
          orderNumber: c.orderNumber || idx + 1,
          startDate: normalizeNullableString(c.startDate),
          contraceptiveType: normalizeNullableString(c.contraceptiveType),
          durationText: normalizeNullableString(c.durationText),
          stopDate: normalizeNullableString(c.stopDate),
          problems: normalizeNullableString(c.problems),
          sideEffects: normalizeNullableString(c.sideEffects),
        }),
      );
    }

    if (dto.healthConditions !== undefined) {
      patch.healthConditions = dto.healthConditions.map((h) => ({
        conditionCode: h.conditionCode,
        hasCondition: Boolean(h.hasCondition),
        diagnosisYear: h.diagnosisYear || null,
        notes: normalizeNullableString(h.notes),
      }));
    }

    patch.patientIdentitySync = patientIdentitySync;

    const updated = await this.maternityRepo.update(id, patch);
    if (!updated) {
      throw new MaternityIntakeNotFoundError(id);
    }
    return updated;
  }
}

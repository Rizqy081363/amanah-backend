import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NikSecurityService } from '../../../../common/security/nik';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { patientProfiles } from '../../../../database/schema/amanah.schema';
import { PersistMaternityIntakeCommand } from '../../domain/commands/maternity.commands';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';
import { MaternityPatientNotFoundError } from '../../domain/errors/maternity.errors';
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
import { CreateMaternityIntakeDto } from '../../presentation/dto/create-maternity-intake.dto';

@Injectable()
export class CreateMaternityIntakeUseCase {
  constructor(
    @Inject(MATERNITY_REPOSITORY)
    private readonly maternityRepo: MaternityRepository,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly obstetricCalculator: ObstetricCalculatorService,
    private readonly nikSecurity: NikSecurityService,
  ) {}

  async execute(
    dto: CreateMaternityIntakeDto,
    submittedByUserId?: string,
  ): Promise<MaternityIntakeEntity> {
    const patient = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.id, dto.patientId),
      with: {
        patientAddresses: true,
      },
    });

    if (!patient) {
      throw new MaternityPatientNotFoundError(dto.patientId);
    }

    let motherName = normalizeNullableString(dto.motherName);
    let motherNik = normalizeNullableString(dto.motherNik);
    let motherBirthDate = normalizeNullableString(dto.motherBirthDate);
    let motherPhone = normalizeNullableString(dto.phoneNumber);
    let domicileAddress = normalizeNullableString(dto.domicileAddress);
    let identityCardAddress = normalizeNullableString(dto.identityCardAddress);

    if (!motherName) motherName = patient.fullName;
    if (!motherNik) {
      motherNik = patient.nationalIdEncrypted
        ? this.nikSecurity.decrypt(patient.nationalIdEncrypted) || ''
        : '';
    }
    if (!motherBirthDate) motherBirthDate = patient.birthDate || null;
    if (!motherPhone) motherPhone = patient.phone || null;
    if (!domicileAddress) {
      const dom = patient.patientAddresses?.find((a) => a.type === 'domicile');
      if (dom) {
        domicileAddress = dom.fullAddress || dom.line1 || null;
      }
    }
    if (!identityCardAddress) {
      const idc = patient.patientAddresses?.find(
        (a) => a.type === 'identity_card',
      );
      if (idc) {
        identityCardAddress = idc.fullAddress || idc.line1 || null;
      }
    }

    const cleanMotherNik = this.nikSecurity.normalize(motherNik || '');
    const cleanPartnerNik = this.nikSecurity.normalize(
      dto.partnerNik || dto.husband?.nik || '',
    );

    assertDistinctNiks(cleanMotherNik, cleanPartnerNik);
    validateDiagnosisYears(dto.healthConditions, motherBirthDate);

    let patientIdentitySync: {
      nationalIdEncrypted: string;
      nationalIdHash: string;
    } | null = null;
    if (cleanMotherNik && cleanMotherNik.length === 16) {
      const blindIndex = this.nikSecurity.computeBlindIndex(cleanMotherNik);
      if (patient.nationalIdHash !== blindIndex) {
        const secured = this.nikSecurity.secure(cleanMotherNik);
        if (secured) {
          patientIdentitySync = {
            nationalIdEncrypted: secured.encrypted,
            nationalIdHash: secured.blindIndex,
          };
        }
      }
    }

    let estimatedDueDate = dto.estimatedDueDate || null;
    let gestationalAgeWeeks = dto.gestationalAgeWeeks || null;
    let gestationalAgeFormatted = dto.gestationalAgeFormatted || null;

    if (dto.hpht) {
      const calc = this.obstetricCalculator.computeFromHpht(dto.hpht);
      estimatedDueDate = calc.estimatedDueDate;
      gestationalAgeWeeks = calc.gestationalAgeWeeks;
      gestationalAgeFormatted = calc.gestationalAgeFormatted;
    }

    const calculatedBmi = calculateBmi(dto.heightCm, dto.prePregnancyWeightKg);
    const effectiveBmi = dto.initialBmi ?? calculatedBmi;

    const command: PersistMaternityIntakeCommand = {
      patientId: dto.patientId,
      appointmentId: dto.appointmentId || null,
      motherName: motherName || patient.fullName,
      motherNik: cleanMotherNik || motherNik || '',
      motherBirthDate,
      motherAge: dto.motherAge || null,
      marriageOrder: dto.marriageOrder ?? 1,
      marriageDate: normalizeNullableString(dto.marriageDate),
      motherJob: normalizeNullableString(dto.motherJob),
      motherEducation: normalizeNullableString(dto.motherEducation),
      religion: normalizeNullableString(dto.religion),
      phoneNumber: motherPhone,
      domicileAddress,
      identityCardAddress,
      dasawisma: normalizeNullableString(dto.dasawisma),
      posyandu: normalizeNullableString(dto.posyandu),
      puskesmas: normalizeNullableString(dto.puskesmas),
      partnerName: normalizeNullableString(
        dto.partnerName || dto.husband?.fullName,
      ),
      partnerNik: cleanPartnerNik || null,
      partnerBirthDate: normalizeNullableString(
        dto.partnerBirthDate || dto.husband?.birthDate,
      ),
      partnerAge: dto.partnerAge || dto.husband?.age || null,
      partnerJob: normalizeNullableString(dto.partnerJob || dto.husband?.job),
      partnerEducation: normalizeNullableString(
        dto.partnerEducation || dto.husband?.education,
      ),
      partnerBloodType: normalizeNullableString(
        dto.partnerBloodType || dto.husband?.bloodType,
      ),
      heightCm: dto.heightCm,
      prePregnancyWeightKg: dto.prePregnancyWeightKg,
      upperArmCircumferenceCm: dto.upperArmCircumferenceCm,
      initialBmi: effectiveBmi,
      tetanusStatus: normalizeNullableString(dto.tetanusStatus),
      motherBloodType: normalizeNullableString(dto.motherBloodType),
      hpht: normalizeNullableString(dto.hpht),
      estimatedDueDate,
      gestationalAgeWeeks,
      gestationalAgeFormatted,
      currentComplaints: normalizeNullableString(dto.currentComplaints),
      gravidaCount: dto.gravidaCount ?? 1,
      parityCount: dto.parityCount ?? 0,
      abortionCount: dto.abortionCount ?? 0,
      livingChildrenCount: dto.livingChildrenCount ?? 0,
      hasPreviousPregnancyHistory: Boolean(dto.hasPreviousPregnancyHistory),
      hasContraceptionHistory: Boolean(dto.hasContraceptionHistory),
      smokedBeforePregnancy: normalizeNullableString(dto.smokedBeforePregnancy),
      alcoholBeforePregnancy: Boolean(dto.alcoholBeforePregnancy),
      irregularDietBeforePregnancy: Boolean(dto.irregularDietBeforePregnancy),
      reducedPhysicalActivityBeforePregnancy: Boolean(
        dto.reducedPhysicalActivityBeforePregnancy,
      ),
      unprescribedMedicationBeforePregnancy: Boolean(
        dto.unprescribedMedicationBeforePregnancy,
      ),
      concerningCosmeticUseBeforePregnancy: Boolean(
        dto.concerningCosmeticUseBeforePregnancy,
      ),
      pesticideExposureBeforePregnancy: Boolean(
        dto.pesticideExposureBeforePregnancy,
      ),
      chemicalExposureBeforePregnancy: Boolean(
        dto.chemicalExposureBeforePregnancy,
      ),
      smokeExposureBeforePregnancy: Boolean(dto.smokeExposureBeforePregnancy),
      concerningEnvironmentNotes: normalizeNullableString(
        dto.concerningEnvironmentNotes,
      ),
      allergyInfo: normalizeNullableString(dto.allergyInfo),
      otherNotes: normalizeNullableString(dto.otherNotes),
      husband: dto.husband?.fullName
        ? {
            fullName: dto.husband.fullName.trim(),
            nik: cleanPartnerNik || null,
            birthDate: normalizeNullableString(dto.husband.birthDate),
            age: dto.husband.age || null,
            job: normalizeNullableString(dto.husband.job),
            education: normalizeNullableString(dto.husband.education),
            bloodType: normalizeNullableString(dto.husband.bloodType),
            phoneNumber: normalizeNullableString(dto.husband.phoneNumber),
          }
        : null,
      previousPregnancies: dto.previousPregnancies?.map((p, idx) => ({
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
      })),
      contraceptiveHistories: dto.contraceptiveHistories?.map((c, idx) => ({
        orderNumber: c.orderNumber || idx + 1,
        startDate: normalizeNullableString(c.startDate),
        contraceptiveType: normalizeNullableString(c.contraceptiveType),
        durationText: normalizeNullableString(c.durationText),
        stopDate: normalizeNullableString(c.stopDate),
        problems: normalizeNullableString(c.problems),
        sideEffects: normalizeNullableString(c.sideEffects),
      })),
      healthConditions: dto.healthConditions?.map((h) => ({
        conditionCode: h.conditionCode,
        hasCondition: Boolean(h.hasCondition),
        diagnosisYear: h.diagnosisYear || null,
        notes: normalizeNullableString(h.notes),
      })),
      submittedByUserId: submittedByUserId || null,
      patientIdentitySync,
      appointmentComplaintSync:
        dto.appointmentId && dto.currentComplaints
          ? {
              appointmentId: dto.appointmentId,
              complaint: normalizeNullableString(dto.currentComplaints),
            }
          : null,
    };

    return this.maternityRepo.create(command, submittedByUserId);
  }
}

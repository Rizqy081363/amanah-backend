import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { and, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  maternalContraceptiveHistories,
  maternalHealthIntakes,
  maternalPreviousPregnancies,
  medicalIntakeSubmissions,
  patientProfiles,
} from '../../../../database/schema/amanah.schema';
import {
  maternalHealthConditionResponses,
  maternalHusbandProfiles,
} from '../../../../database/schema/maternal.schema';
import { AppointmentsService } from '../../../appointments/application/appointments.service';
import {
  MaternityHistoryQuery,
  MaternityHistoryResult,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';
import { ObstetricCalculatorService } from '../../domain/services/obstetric-calculator.service';
import { CreateMaternityIntakeDto } from '../../presentation/dto/create-maternity-intake.dto';
import { UpdateMaternityIntakeDto } from '../../presentation/dto/update-maternity-intake.dto';
import { NikSecurityService } from '../../../../common/security/nik';
import {
  mapContraceptiveHistoryRow,
  mapPreviousPregnancyRow,
  mapToMaternityEntity,
  toSafeNumericString,
} from './maternity-persistence.helper';

@Injectable()
export class MaternityDrizzleRepository implements MaternityRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly obstetricCalculator: ObstetricCalculatorService,
    private readonly nikSecurity: NikSecurityService,
    @Optional()
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService?: AppointmentsService,
  ) {}

  async create(
    dto: CreateMaternityIntakeDto,
    submittedByUserId?: string,
  ): Promise<MaternityIntakeEntity> {
    let createdIntakeId = '';

    await this.db.transaction(async (tx) => {
      // 1. Resolve patient profile fallback if demographic data missing
      let motherName = dto.motherName?.trim();
      let motherNik = dto.motherNik?.trim();
      let motherBirthDate = dto.motherBirthDate;
      let motherPhone = dto.phoneNumber?.trim();
      let domicileAddress = dto.domicileAddress?.trim();

      const patient = await tx.query.patientProfiles.findFirst({
        where: eq(patientProfiles.id, dto.patientId),
        with: {
          patientAddresses: true,
        },
      });

      if (patient) {
        if (!motherName) motherName = patient.fullName;
        if (!motherNik) {
          motherNik = patient.nationalIdEncrypted
            ? this.nikSecurity.decrypt(patient.nationalIdEncrypted) || ''
            : patient.nationalIdHash && !patient.nationalIdHash.includes(':')
              ? patient.nationalIdHash
              : '';
        }
        if (!motherBirthDate) motherBirthDate = patient.birthDate || undefined;
        if (!motherPhone) motherPhone = patient.phone || undefined;
        if (!domicileAddress && patient.patientAddresses?.[0]) {
          domicileAddress =
            patient.patientAddresses[0].fullAddress ||
            patient.patientAddresses[0].line1 ||
            undefined;
        }
      }

      // 2. Obstetric calculation from HPHT if provided
      let estimatedDueDate = dto.estimatedDueDate;
      let gestationalAgeWeeks = dto.gestationalAgeWeeks;
      let gestationalAgeFormatted = dto.gestationalAgeFormatted;

      if (dto.hpht) {
        try {
          const calc = this.obstetricCalculator.computeFromHpht(dto.hpht);
          estimatedDueDate = calc.estimatedDueDate;
          gestationalAgeWeeks = calc.gestationalAgeWeeks;
          gestationalAgeFormatted = calc.gestationalAgeFormatted;
        } catch {
          // Keep provided values if parsing fails
        }
      }

      // 3. BMI calculation
      let initialBmi = dto.initialBmi;
      if (!initialBmi && dto.heightCm && dto.prePregnancyWeightKg) {
        const heightM = Number(dto.heightCm) / 100;
        const weightKg = Number(dto.prePregnancyWeightKg);
        if (heightM > 0 && weightKg > 0) {
          initialBmi = Number((weightKg / (heightM * heightM)).toFixed(1));
        }
      }

      // 4. Audit clinical intake submission
      const [submission] = await tx
        .insert(medicalIntakeSubmissions)
        .values({
          appointmentId: dto.appointmentId || null,
          patientId: dto.patientId,
          flow: 'pregnancy',
          schemaVersion: 'v2',
          schemaTitle:
            'Formulir Pendaftaran Skrining Kehamilan / KIA - Amanah Health Care',
          answers: {
            motherName: motherName || '',
            motherNik: motherNik || '',
            motherBirthDate: motherBirthDate || '',
            phoneNumber: motherPhone || '',
            currentComplaints: dto.currentComplaints,
            hpht: dto.hpht || '',
            estimatedDueDate: estimatedDueDate || '',
            gestationalAgeFormatted: gestationalAgeFormatted || '',
            gravidaCount: dto.gravidaCount,
            parityCount: dto.parityCount,
            abortionCount: dto.abortionCount,
            livingChildrenCount: dto.livingChildrenCount,
          },
          automatic: {
            estimatedDueDate: estimatedDueDate || '',
            gestationalAgeFormatted: gestationalAgeFormatted || '',
            initialBmi: initialBmi || null,
          },
          submittedBy: submittedByUserId || null,
        })
        .returning();

      // 5. Insert maternal health intake header
      const [intake] = await tx
        .insert(maternalHealthIntakes)
        .values({
          intakeSubmissionId: submission.id,
          patientId: dto.patientId,
          appointmentId: dto.appointmentId || null,
          motherName: motherName || '',
          motherNik: motherNik || '',
          motherBirthDate: motherBirthDate || null,
          motherAge: dto.motherAge || null,
          marriageOrder: dto.marriageOrder || 1,
          marriageDate: dto.marriageDate || null,
          motherJob: dto.motherJob || null,
          motherEducation: dto.motherEducation || null,
          religion: dto.religion || null,
          phoneNumber: motherPhone || null,
          domicileAddress: domicileAddress || null,
          identityCardAddress: dto.identityCardAddress || null,
          dasawisma: dto.dasawisma || null,
          posyandu: dto.posyandu || null,
          puskesmas: dto.puskesmas || null,
          partnerName: dto.partnerName || dto.husband?.fullName || null,
          partnerNik: dto.partnerNik || dto.husband?.nik || null,
          partnerBirthDate: dto.partnerBirthDate || dto.husband?.birthDate || null,
          partnerAge: dto.partnerAge || dto.husband?.age || null,
          partnerJob: dto.partnerJob || dto.husband?.job || null,
          partnerEducation: dto.partnerEducation || dto.husband?.education || null,
          partnerBloodType: dto.partnerBloodType || dto.husband?.bloodType || null,
          heightCm: toSafeNumericString(dto.heightCm, 3, 2),
          prePregnancyWeightKg: toSafeNumericString(
            dto.prePregnancyWeightKg,
            3,
            2,
          ),
          upperArmCircumferenceCm: toSafeNumericString(
            dto.upperArmCircumferenceCm,
            3,
            1,
          ),
          initialBmi: toSafeNumericString(initialBmi, 3, 1),
          tetanusStatus: dto.tetanusStatus || null,
          motherBloodType: dto.motherBloodType || null,
          hpht: dto.hpht || null,
          estimatedDueDate: estimatedDueDate || null,
          gestationalAgeWeeks: toSafeNumericString(
            gestationalAgeWeeks,
            3,
            1,
          ),
          gestationalAgeFormatted: gestationalAgeFormatted || null,
          currentComplaints: dto.currentComplaints,
          gravidaCount: dto.gravidaCount,
          parityCount: dto.parityCount,
          abortionCount: dto.abortionCount,
          livingChildrenCount: dto.livingChildrenCount,
          hasPreviousPregnancyHistory: dto.hasPreviousPregnancyHistory || false,
          hasContraceptionHistory: dto.hasContraceptionHistory || false,
          smokedBeforePregnancy: dto.smokedBeforePregnancy || null,
          alcoholBeforePregnancy: dto.alcoholBeforePregnancy || false,
          irregularDietBeforePregnancy:
            dto.irregularDietBeforePregnancy || false,
          reducedPhysicalActivityBeforePregnancy:
            dto.reducedPhysicalActivityBeforePregnancy || false,
          unprescribedMedicationBeforePregnancy:
            dto.unprescribedMedicationBeforePregnancy || false,
          concerningCosmeticUseBeforePregnancy:
            dto.concerningCosmeticUseBeforePregnancy || false,
          pesticideExposureBeforePregnancy:
            dto.pesticideExposureBeforePregnancy || false,
          chemicalExposureBeforePregnancy:
            dto.chemicalExposureBeforePregnancy || false,
          smokeExposureBeforePregnancy:
            dto.smokeExposureBeforePregnancy || false,
          concerningEnvironmentNotes: dto.concerningEnvironmentNotes || null,
          allergyInfo: dto.allergyInfo || null,
          otherNotes: dto.otherNotes || null,
        })
        .returning();

      // 6. Husband Profile
      if (dto.husband && dto.husband.fullName) {
        await tx.insert(maternalHusbandProfiles).values({
          maternalIntakeId: intake.id,
          fullName: dto.husband.fullName,
          nik: dto.husband.nik || null,
          birthDate: dto.husband.birthDate || null,
          age: dto.husband.age || null,
          job: dto.husband.job || null,
          education: dto.husband.education || null,
          bloodType: dto.husband.bloodType || null,
          phoneNumber: dto.husband.phoneNumber || null,
        });
      }

      // 7. Previous Pregnancies
      if (dto.previousPregnancies && dto.previousPregnancies.length > 0) {
        const rows = dto.previousPregnancies.map((p, idx) =>
          mapPreviousPregnancyRow(p, intake.id, idx),
        );
        await tx.insert(maternalPreviousPregnancies).values(rows);
      }

      // 8. Contraceptive Histories
      if (dto.contraceptiveHistories && dto.contraceptiveHistories.length > 0) {
        const rows = dto.contraceptiveHistories.map((c, idx) =>
          mapContraceptiveHistoryRow(c, intake.id, idx),
        );
        await tx.insert(maternalContraceptiveHistories).values(rows);
      }

      // 9. Normalized Health Conditions
      if (dto.healthConditions && dto.healthConditions.length > 0) {
        const currentYear = new Date().getFullYear();
        let motherBirthYear: number | null = null;
        if (motherBirthDate) {
          const parsed = new Date(motherBirthDate).getFullYear();
          if (!Number.isNaN(parsed)) {
            motherBirthYear = parsed;
          }
        }

        for (const cond of dto.healthConditions) {
          if (cond.diagnosisYear !== null && cond.diagnosisYear !== undefined) {
            if (cond.diagnosisYear > currentYear) {
              throw new BadRequestException(
                `Tahun terdiagnosis (${cond.diagnosisYear}) tidak boleh melebihi tahun saat ini (${currentYear})`,
              );
            }
            if (motherBirthYear && cond.diagnosisYear < motherBirthYear) {
              throw new BadRequestException(
                `Tahun terdiagnosis (${cond.diagnosisYear}) tidak boleh lebih awal dari tahun kelahiran pasien (${motherBirthYear})`,
              );
            }
          }
        }

        const conditionRows = dto.healthConditions.map((cond) => ({
          maternalIntakeId: intake.id,
          conditionCode: cond.conditionCode,
          hasCondition: cond.hasCondition,
          diagnosisYear: cond.diagnosisYear || null,
          notes: cond.notes || null,
        }));

        await tx.insert(maternalHealthConditionResponses).values(conditionRows);
      }

      createdIntakeId = intake.id;
    });

    const result = await this.findById(createdIntakeId);
    return result!;
  }

  async update(
    id: string,
    dto: UpdateMaternityIntakeDto,
  ): Promise<MaternityIntakeEntity | null> {
    let updatedIntakeId: string | null = null;

    await this.db.transaction(async (tx) => {
      const existing = await tx.query.maternalHealthIntakes.findFirst({
        where: or(
          eq(maternalHealthIntakes.id, id),
          eq(maternalHealthIntakes.intakeSubmissionId, id),
        ),
      });

      if (!existing) {
        return null;
      }

      const intakeId = existing.id;

      // Obstetric recalculation if HPHT updated
      let estimatedDueDate = dto.estimatedDueDate;
      let gestationalAgeWeeks = dto.gestationalAgeWeeks;
      let gestationalAgeFormatted = dto.gestationalAgeFormatted;

      if (dto.hpht && dto.hpht !== existing.hpht) {
        try {
          const calc = this.obstetricCalculator.computeFromHpht(dto.hpht);
          estimatedDueDate = calc.estimatedDueDate;
          gestationalAgeWeeks = calc.gestationalAgeWeeks;
          gestationalAgeFormatted = calc.gestationalAgeFormatted;
        } catch {
          // Keep existing/provided
        }
      }

      // Update maternalHealthIntakes fields
      const patchValues: Record<string, any> = {};
      if (dto.motherName !== undefined) patchValues.motherName = dto.motherName;
      if (dto.motherNik !== undefined) patchValues.motherNik = dto.motherNik;
      if (dto.motherBirthDate !== undefined)
        patchValues.motherBirthDate = dto.motherBirthDate;
      if (dto.motherAge !== undefined) patchValues.motherAge = dto.motherAge;
      if (dto.marriageOrder !== undefined)
        patchValues.marriageOrder = dto.marriageOrder;
      if (dto.marriageDate !== undefined)
        patchValues.marriageDate = dto.marriageDate;
      if (dto.motherJob !== undefined) patchValues.motherJob = dto.motherJob;
      if (dto.motherEducation !== undefined)
        patchValues.motherEducation = dto.motherEducation;
      if (dto.religion !== undefined) patchValues.religion = dto.religion;
      if (dto.phoneNumber !== undefined)
        patchValues.phoneNumber = dto.phoneNumber;
      if (dto.domicileAddress !== undefined)
        patchValues.domicileAddress = dto.domicileAddress;
      if (dto.identityCardAddress !== undefined)
        patchValues.identityCardAddress = dto.identityCardAddress;
      if (dto.dasawisma !== undefined) patchValues.dasawisma = dto.dasawisma;
      if (dto.posyandu !== undefined) patchValues.posyandu = dto.posyandu;
      if (dto.puskesmas !== undefined) patchValues.puskesmas = dto.puskesmas;

      if (dto.partnerName !== undefined)
        patchValues.partnerName = dto.partnerName;
      if (dto.partnerNik !== undefined) patchValues.partnerNik = dto.partnerNik;
      if (dto.partnerBirthDate !== undefined)
        patchValues.partnerBirthDate = dto.partnerBirthDate;
      if (dto.partnerAge !== undefined) patchValues.partnerAge = dto.partnerAge;
      if (dto.partnerJob !== undefined) patchValues.partnerJob = dto.partnerJob;
      if (dto.partnerEducation !== undefined)
        patchValues.partnerEducation = dto.partnerEducation;
      if (dto.partnerBloodType !== undefined)
        patchValues.partnerBloodType = dto.partnerBloodType;

      if (dto.heightCm !== undefined)
        patchValues.heightCm = toSafeNumericString(dto.heightCm, 3, 2);
      if (dto.prePregnancyWeightKg !== undefined)
        patchValues.prePregnancyWeightKg = toSafeNumericString(
          dto.prePregnancyWeightKg,
          3,
          2,
        );
      if (dto.upperArmCircumferenceCm !== undefined)
        patchValues.upperArmCircumferenceCm = toSafeNumericString(
          dto.upperArmCircumferenceCm,
          3,
          1,
        );
      if (dto.initialBmi !== undefined)
        patchValues.initialBmi = toSafeNumericString(dto.initialBmi, 3, 1);
      if (dto.tetanusStatus !== undefined)
        patchValues.tetanusStatus = dto.tetanusStatus;
      if (dto.motherBloodType !== undefined)
        patchValues.motherBloodType = dto.motherBloodType;

      if (dto.hpht !== undefined) patchValues.hpht = dto.hpht;
      if (estimatedDueDate !== undefined)
        patchValues.estimatedDueDate = estimatedDueDate;
      if (gestationalAgeWeeks !== undefined)
        patchValues.gestationalAgeWeeks = toSafeNumericString(
          gestationalAgeWeeks,
          3,
          1,
        );
      if (gestationalAgeFormatted !== undefined)
        patchValues.gestationalAgeFormatted = gestationalAgeFormatted;
      if (dto.currentComplaints !== undefined)
        patchValues.currentComplaints = dto.currentComplaints;

      if (dto.gravidaCount !== undefined)
        patchValues.gravidaCount = dto.gravidaCount;
      if (dto.parityCount !== undefined)
        patchValues.parityCount = dto.parityCount;
      if (dto.abortionCount !== undefined)
        patchValues.abortionCount = dto.abortionCount;
      if (dto.livingChildrenCount !== undefined)
        patchValues.livingChildrenCount = dto.livingChildrenCount;
      if (dto.hasPreviousPregnancyHistory !== undefined)
        patchValues.hasPreviousPregnancyHistory =
          dto.hasPreviousPregnancyHistory;
      if (dto.hasContraceptionHistory !== undefined)
        patchValues.hasContraceptionHistory = dto.hasContraceptionHistory;

      if (dto.smokedBeforePregnancy !== undefined)
        patchValues.smokedBeforePregnancy = dto.smokedBeforePregnancy;
      if (dto.alcoholBeforePregnancy !== undefined)
        patchValues.alcoholBeforePregnancy = dto.alcoholBeforePregnancy;
      if (dto.irregularDietBeforePregnancy !== undefined)
        patchValues.irregularDietBeforePregnancy =
          dto.irregularDietBeforePregnancy;
      if (dto.reducedPhysicalActivityBeforePregnancy !== undefined)
        patchValues.reducedPhysicalActivityBeforePregnancy =
          dto.reducedPhysicalActivityBeforePregnancy;
      if (dto.unprescribedMedicationBeforePregnancy !== undefined)
        patchValues.unprescribedMedicationBeforePregnancy =
          dto.unprescribedMedicationBeforePregnancy;
      if (dto.concerningCosmeticUseBeforePregnancy !== undefined)
        patchValues.concerningCosmeticUseBeforePregnancy =
          dto.concerningCosmeticUseBeforePregnancy;
      if (dto.pesticideExposureBeforePregnancy !== undefined)
        patchValues.pesticideExposureBeforePregnancy =
          dto.pesticideExposureBeforePregnancy;
      if (dto.chemicalExposureBeforePregnancy !== undefined)
        patchValues.chemicalExposureBeforePregnancy =
          dto.chemicalExposureBeforePregnancy;
      if (dto.smokeExposureBeforePregnancy !== undefined)
        patchValues.smokeExposureBeforePregnancy =
          dto.smokeExposureBeforePregnancy;
      if (dto.concerningEnvironmentNotes !== undefined)
        patchValues.concerningEnvironmentNotes =
          dto.concerningEnvironmentNotes;
      if (dto.allergyInfo !== undefined)
        patchValues.allergyInfo = dto.allergyInfo;
      if (dto.otherNotes !== undefined) patchValues.otherNotes = dto.otherNotes;

      patchValues.updatedAt = new Date().toISOString();

      await tx
        .update(maternalHealthIntakes)
        .set(patchValues)
        .where(eq(maternalHealthIntakes.id, intakeId));

      // Husband Profile Upsert
      if (dto.husband) {
        const existingHusband =
          await tx.query.maternalHusbandProfiles.findFirst({
            where: eq(maternalHusbandProfiles.maternalIntakeId, intakeId),
          });
        if (existingHusband) {
          await tx
            .update(maternalHusbandProfiles)
            .set({
              fullName: dto.husband.fullName || existingHusband.fullName,
              nik: dto.husband.nik !== undefined ? dto.husband.nik : existingHusband.nik,
              birthDate:
                dto.husband.birthDate !== undefined
                  ? dto.husband.birthDate
                  : existingHusband.birthDate,
              age:
                dto.husband.age !== undefined
                  ? dto.husband.age
                  : existingHusband.age,
              job:
                dto.husband.job !== undefined
                  ? dto.husband.job
                  : existingHusband.job,
              education:
                dto.husband.education !== undefined
                  ? dto.husband.education
                  : existingHusband.education,
              bloodType:
                dto.husband.bloodType !== undefined
                  ? dto.husband.bloodType
                  : existingHusband.bloodType,
              phoneNumber:
                dto.husband.phoneNumber !== undefined
                  ? dto.husband.phoneNumber
                  : existingHusband.phoneNumber,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(maternalHusbandProfiles.id, existingHusband.id));
        } else if (dto.husband.fullName) {
          await tx.insert(maternalHusbandProfiles).values({
            maternalIntakeId: intakeId,
            fullName: dto.husband.fullName,
            nik: dto.husband.nik || null,
            birthDate: dto.husband.birthDate || null,
            age: dto.husband.age || null,
            job: dto.husband.job || null,
            education: dto.husband.education || null,
            bloodType: dto.husband.bloodType || null,
            phoneNumber: dto.husband.phoneNumber || null,
          });
        }
      }

      // Previous Pregnancies replace
      if (dto.previousPregnancies !== undefined) {
        await tx
          .delete(maternalPreviousPregnancies)
          .where(eq(maternalPreviousPregnancies.maternalIntakeId, intakeId));

        if (dto.previousPregnancies.length > 0) {
          const rows = dto.previousPregnancies.map((p, idx) =>
            mapPreviousPregnancyRow(p, intakeId, idx),
          );
          await tx.insert(maternalPreviousPregnancies).values(rows);
        }
      }

      // Contraceptive Histories replace
      if (dto.contraceptiveHistories !== undefined) {
        await tx
          .delete(maternalContraceptiveHistories)
          .where(eq(maternalContraceptiveHistories.maternalIntakeId, intakeId));

        if (dto.contraceptiveHistories.length > 0) {
          const rows = dto.contraceptiveHistories.map((c, idx) =>
            mapContraceptiveHistoryRow(c, intakeId, idx),
          );
          await tx.insert(maternalContraceptiveHistories).values(rows);
        }
      }

      // Health Conditions upsert
      if (dto.healthConditions !== undefined) {
        const currentYear = new Date().getFullYear();
        const effectiveBirthDate =
          dto.motherBirthDate || existing.motherBirthDate;
        let motherBirthYear: number | null = null;
        if (effectiveBirthDate) {
          const parsed = new Date(effectiveBirthDate).getFullYear();
          if (!Number.isNaN(parsed)) {
            motherBirthYear = parsed;
          }
        }

        for (const cond of dto.healthConditions) {
          if (cond.diagnosisYear !== null && cond.diagnosisYear !== undefined) {
            if (cond.diagnosisYear > currentYear) {
              throw new BadRequestException(
                `Tahun terdiagnosis (${cond.diagnosisYear}) tidak boleh melebihi tahun saat ini (${currentYear})`,
              );
            }
            if (motherBirthYear && cond.diagnosisYear < motherBirthYear) {
              throw new BadRequestException(
                `Tahun terdiagnosis (${cond.diagnosisYear}) tidak boleh lebih awal dari tahun kelahiran pasien (${motherBirthYear})`,
              );
            }
          }

          const existingCond =
            await tx.query.maternalHealthConditionResponses.findFirst({
              where: and(
                eq(maternalHealthConditionResponses.maternalIntakeId, intakeId),
                eq(
                  maternalHealthConditionResponses.conditionCode,
                  cond.conditionCode,
                ),
              ),
            });

          if (existingCond) {
            await tx
              .update(maternalHealthConditionResponses)
              .set({
                hasCondition: cond.hasCondition,
                diagnosisYear: cond.diagnosisYear || null,
                notes: cond.notes || null,
              })
              .where(eq(maternalHealthConditionResponses.id, existingCond.id));
          } else {
            await tx.insert(maternalHealthConditionResponses).values({
              maternalIntakeId: intakeId,
              conditionCode: cond.conditionCode,
              hasCondition: cond.hasCondition,
              diagnosisYear: cond.diagnosisYear || null,
              notes: cond.notes || null,
            });
          }
        }
      }

      updatedIntakeId = intakeId;
    });

    if (!updatedIntakeId) return null;
    return this.findById(updatedIntakeId);
  }

  async findById(id: string): Promise<MaternityIntakeEntity | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: or(
        eq(maternalHealthIntakes.id, id),
        eq(maternalHealthIntakes.intakeSubmissionId, id),
      ),
      with: {
        husband: true,
        healthConditions: true,
        previousPregnancies: true,
        contraceptiveHistories: true,
      },
    });

    if (!record) return null;

    return mapToMaternityEntity(record);
  }

  async findByAppointmentId(
    appointmentId: string,
  ): Promise<MaternityIntakeEntity | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: eq(maternalHealthIntakes.appointmentId, appointmentId),
      with: {
        husband: true,
        healthConditions: true,
        previousPregnancies: true,
        contraceptiveHistories: true,
      },
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });

    if (!record) return null;

    return mapToMaternityEntity(record);
  }

  async findLatestByPatientId(
    patientId: string,
  ): Promise<MaternityIntakeEntity | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: eq(maternalHealthIntakes.patientId, patientId),
      with: {
        husband: true,
        healthConditions: true,
        previousPregnancies: true,
        contraceptiveHistories: true,
      },
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });

    if (!record) return null;

    return mapToMaternityEntity(record);
  }

  async findByPatientId(patientId: string): Promise<MaternityIntakeEntity[]> {
    const records = await this.db.query.maternalHealthIntakes.findMany({
      where: eq(maternalHealthIntakes.patientId, patientId),
      with: {
        husband: true,
        healthConditions: true,
        previousPregnancies: true,
        contraceptiveHistories: true,
      },
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });

    return records.map((r) => mapToMaternityEntity(r));
  }

  async findMaternalHistory(
    patientIds: string[],
    query: MaternityHistoryQuery,
  ): Promise<MaternityHistoryResult> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (patientIds && patientIds.length > 0) {
      conditions.push(inArray(maternalHealthIntakes.patientId, patientIds));
    } else if (query.patientId) {
      conditions.push(eq(maternalHealthIntakes.patientId, query.patientId));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(maternalHealthIntakes.motherName, term),
          ilike(maternalHealthIntakes.motherNik, term),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await this.db
      .select({ count: count() })
      .from(maternalHealthIntakes)
      .where(whereClause);

    const total = Number(totalRes?.count || 0);

    const records = await this.db.query.maternalHealthIntakes.findMany({
      where: whereClause,
      with: {
        husband: true,
        healthConditions: true,
        previousPregnancies: true,
        contraceptiveHistories: true,
      },
      limit,
      offset,
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });

    return {
      data: records.map((r) => mapToMaternityEntity(r)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }
}

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  maternalAnamnesisResponses,
  maternalContraceptiveHistories,
  maternalHealthConditionCatalog,
  maternalHealthConditionResponses,
  maternalHealthIntakes,
  maternalHusbandProfiles,
  maternalPreviousPregnancies,
  medicalIntakeSubmissions,
  patientProfiles,
} from '../../../../database/schema';
import { ObstetricCalculatorService } from '../../domain/services/obstetric-calculator.service';
import { CreateMaternityIntakeDto } from '../../presentation/dto/create-maternity-intake.dto';
import { UpdateMaternityIntakeDto } from '../../presentation/dto/update-maternity-intake.dto';

@Injectable()
export class MaternalIntakeDrizzleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly obstetricCalculator: ObstetricCalculatorService,
  ) {}

  async create(
    dto: CreateMaternityIntakeDto,
    submittedByUserId?: string,
  ): Promise<any> {
    return await this.db.transaction(async (tx) => {
      let targetMotherName = dto.motherName;
      let targetMotherNik = dto.motherNik;
      let targetMotherBirthDate = dto.motherBirthDate;
      let targetPhone = dto.phoneNumber;
      let targetBloodType = dto.motherBloodType;

      if (!targetMotherName || !targetMotherNik || !targetMotherBirthDate) {
        const [patient] = await tx
          .select()
          .from(patientProfiles)
          .where(eq(patientProfiles.id, dto.patientId))
          .limit(1);

        if (patient) {
          targetMotherName = targetMotherName || patient.fullName;
          targetMotherNik =
            targetMotherNik ||
            patient.nationalIdEncrypted ||
            patient.nationalIdHash ||
            undefined;
          targetMotherBirthDate = targetMotherBirthDate || patient.birthDate;
          targetPhone = targetPhone || patient.phone || '';
          targetBloodType =
            targetBloodType || patient.bloodType || 'unknown';
        }
      }

      const answersMap: Record<string, any> = {
        motherName: targetMotherName,
        motherNik: targetMotherNik,
        motherBirthDate: targetMotherBirthDate,
        motherAge: dto.motherAge,
        marriageOrder: dto.marriageOrder,
        marriageDate: dto.marriageDate,
        motherJob: dto.motherJob,
        motherEducation: dto.motherEducation,
        religion: dto.religion,
        phoneNumber: targetPhone,
        domicileAddress: dto.domicileAddress,
        identityCardAddress: dto.identityCardAddress,
        dasawisma: dto.dasawisma,
        posyandu: dto.posyandu,
        puskesmas: dto.puskesmas,
        partnerName: dto.husband?.fullName || dto.partnerName,
        partnerNik: dto.husband?.nik || dto.partnerNik,
        partnerBirthDate: dto.husband?.birthDate || dto.partnerBirthDate,
        partnerAge: dto.husband?.age || dto.partnerAge,
        partnerJob: dto.husband?.job || dto.partnerJob,
        partnerEducation: dto.husband?.education || dto.partnerEducation,
        partnerBloodType: dto.husband?.bloodType || dto.partnerBloodType,
        heightCm: dto.heightCm,
        prePregnancyWeightKg: dto.prePregnancyWeightKg,
        upperArmCircumferenceCm: dto.upperArmCircumferenceCm,
        initialBmi: dto.initialBmi,
        tetanusStatus: dto.tetanusStatus,
        motherBloodType: dto.motherBloodType,
        hpht: dto.hpht,
        currentComplaints: dto.currentComplaints,
        gravidaCount: dto.gravidaCount,
        parityCount: dto.parityCount,
        abortionCount: dto.abortionCount,
        livingChildrenCount: dto.livingChildrenCount,
        hasPreviousPregnancyHistory: dto.hasPreviousPregnancyHistory
          ? 'Ya, ada'
          : 'Belum/tidak ada',
        hasContraceptionHistory: dto.hasContraceptionHistory
          ? 'Ya, pernah'
          : 'Belum pernah',
        concerningEnvironmentNotes: dto.concerningEnvironmentNotes,
        allergyInfo: dto.allergyInfo,
        otherNotes: dto.otherNotes,
        ...(dto.diseaseHistory || {}),
      };

      const obstetricData = dto.hpht
        ? this.obstetricCalculator.computeFromHpht(dto.hpht)
        : null;

      const automaticMap: Record<string, any> = {
        imtAtSubmit: dto.initialBmi ? `${dto.initialBmi} kg/m²` : '',
        estimatedDueDate: obstetricData?.estimatedDueDate ?? '',
        gestationalAgeAtSubmit: obstetricData?.gestationalAgeFormatted ?? '',
      };

      const safeAppointmentId =
        dto.appointmentId && dto.appointmentId.trim()
          ? dto.appointmentId.trim()
          : null;

      const [submission] = await tx
        .insert(medicalIntakeSubmissions)
        .values({
          appointmentId: safeAppointmentId,
          patientId: dto.patientId,
          flow: 'pregnancy',
          schemaVersion: 'v2',
          schemaTitle:
            'Form Awal Kehamilan - Praktik Mandiri Bidan Nur Hidayatun',
          answers: answersMap,
          automatic: automaticMap,
          submittedBy: submittedByUserId || null,
        })
        .returning();

      const [maternalRecord] = await tx
        .insert(maternalHealthIntakes)
        .values({
          intakeSubmissionId: submission.id,
          patientId: dto.patientId,
          appointmentId: safeAppointmentId,
          motherNik: targetMotherNik || '',
          motherName: targetMotherName || '',
          motherBirthDate: targetMotherBirthDate || null,
          motherAge: dto.motherAge || null,
          marriageOrder: dto.marriageOrder || 1,
          marriageDate: dto.marriageDate || null,
          motherJob: dto.motherJob || null,
          motherEducation: dto.motherEducation || null,
          religion: dto.religion || null,
          phoneNumber: targetPhone || null,
          domicileAddress: dto.domicileAddress || null,
          identityCardAddress: dto.identityCardAddress || null,
          dasawisma: dto.dasawisma || null,
          posyandu: dto.posyandu || null,
          puskesmas: dto.puskesmas || null,
          partnerName: dto.husband?.fullName || dto.partnerName || null,
          partnerNik: dto.husband?.nik || dto.partnerNik || null,
          partnerBirthDate:
            dto.husband?.birthDate || dto.partnerBirthDate || null,
          partnerAge: dto.husband?.age || dto.partnerAge || null,
          partnerJob: dto.husband?.job || dto.partnerJob || null,
          partnerEducation:
            dto.husband?.education || dto.partnerEducation || null,
          partnerBloodType:
            dto.husband?.bloodType || dto.partnerBloodType || null,
          heightCm: dto.heightCm ? String(dto.heightCm) : null,
          prePregnancyWeightKg: dto.prePregnancyWeightKg
            ? String(dto.prePregnancyWeightKg)
            : null,
          upperArmCircumferenceCm: dto.upperArmCircumferenceCm
            ? String(dto.upperArmCircumferenceCm)
            : null,
          initialBmi: dto.initialBmi ? String(dto.initialBmi) : null,
          tetanusStatus: dto.tetanusStatus || null,
          motherBloodType: targetBloodType || null,
          hpht: dto.hpht || null,
          estimatedDueDate: obstetricData?.estimatedDueDate ?? null,
          gestationalAgeWeeks:
            obstetricData?.gestationalAgeWeeks != null
              ? String(obstetricData.gestationalAgeWeeks)
              : null,
          gestationalAgeFormatted:
            obstetricData?.gestationalAgeFormatted ?? null,
          currentComplaints: dto.currentComplaints,
          gravidaCount: dto.gravidaCount,
          parityCount: dto.parityCount,
          abortionCount: dto.abortionCount,
          livingChildrenCount: dto.livingChildrenCount,
          hasPreviousPregnancyHistory: Boolean(dto.hasPreviousPregnancyHistory),
          hasContraceptionHistory: Boolean(dto.hasContraceptionHistory),
          smokedBeforePregnancy: dto.smokedBeforePregnancy || null,
          alcoholBeforePregnancy: Boolean(dto.alcoholBeforePregnancy),
          irregularDietBeforePregnancy: Boolean(
            dto.irregularDietBeforePregnancy,
          ),
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
          smokeExposureBeforePregnancy: Boolean(
            dto.smokeExposureBeforePregnancy,
          ),
          concerningEnvironmentNotes: dto.concerningEnvironmentNotes || null,
          allergyInfo: dto.allergyInfo || null,
          otherNotes: dto.otherNotes || null,
          diseaseHistory: dto.diseaseHistory || {},
        })
        .returning();

      let createdHusband = null;
      const husbandFullName = dto.husband?.fullName || dto.partnerName;
      if (husbandFullName) {
        const [husbandRow] = await tx
          .insert(maternalHusbandProfiles)
          .values({
            maternalIntakeId: maternalRecord.id,
            fullName: husbandFullName,
            nik: dto.husband?.nik || dto.partnerNik || null,
            birthDate: dto.husband?.birthDate || dto.partnerBirthDate || null,
            age: dto.husband?.age || dto.partnerAge || null,
            job: dto.husband?.job || dto.partnerJob || null,
            education: dto.husband?.education || dto.partnerEducation || null,
            bloodType: dto.husband?.bloodType || dto.partnerBloodType || null,
            phoneNumber: dto.husband?.phoneNumber || null,
          })
          .returning();
        createdHusband = husbandRow;
      }

      let createdAnamnesisResponses: any[] = [];
      if (
        Array.isArray(dto.anamnesisResponses) &&
        dto.anamnesisResponses.length > 0
      ) {
        const questions = await tx.query.maternalScreeningQuestions.findMany({
          with: { options: true },
        });
        const qMap = new Map(questions.map((q) => [q.code, q]));

        const inserts = [];
        for (const resp of dto.anamnesisResponses) {
          const q = qMap.get(resp.questionCode);
          if (!q) continue;
          const opt = resp.selectedOptionCode
            ? q.options.find(
                (o) =>
                  o.optionCode.toLowerCase() ===
                  resp.selectedOptionCode?.toLowerCase(),
              )
            : null;

          inserts.push({
            maternalIntakeId: maternalRecord.id,
            questionId: q.id,
            questionCode: resp.questionCode,
            selectedOptionId: opt?.id || null,
            selectedOptionCode: resp.selectedOptionCode || null,
            textResponse: resp.textResponse || null,
          });
        }

        if (inserts.length > 0) {
          createdAnamnesisResponses = await tx
            .insert(maternalAnamnesisResponses)
            .values(inserts)
            .returning();
        }
      }

      let createdConditionResponses: any[] = [];
      if (
        Array.isArray(dto.healthConditions) &&
        dto.healthConditions.length > 0
      ) {
        const conditions =
          await tx.query.maternalHealthConditionCatalog.findMany();
        const cMap = new Map<string, string>(
          conditions.map((c) => [c.code, c.id]),
        );

        const inserts = [];
        for (const cond of dto.healthConditions) {
          const condId = cMap.get(cond.conditionCode);
          if (!condId) continue;

          inserts.push({
            maternalIntakeId: maternalRecord.id,
            conditionId: condId,
            conditionCode: cond.conditionCode,
            hasCondition: cond.hasCondition,
            diagnosisYear: cond.diagnosisYear || null,
            notes: cond.notes || null,
          });
        }

        if (inserts.length > 0) {
          createdConditionResponses = await tx
            .insert(maternalHealthConditionResponses)
            .values(inserts)
            .returning();
        }
      }

      let createdPregnancies: any[] = [];
      if (
        Array.isArray(dto.previousPregnancies) &&
        dto.previousPregnancies.length > 0
      ) {
        createdPregnancies = await tx
          .insert(maternalPreviousPregnancies)
          .values(
            dto.previousPregnancies.map((p) => ({
              maternalIntakeId: maternalRecord.id,
              orderNumber: p.orderNumber,
              birthYear: p.birthYear || null,
              birthWeightGrams: p.birthWeightGrams || null,
              birthLengthCm: p.birthLengthCm ? String(p.birthLengthCm) : null,
              childSex: p.childSex || null,
              gestationalAgeAtBirth: p.gestationalAgeAtBirth || null,
              birthAttendant: p.birthAttendant || null,
              deliveryMethod: p.deliveryMethod || null,
              deliveryPlace: p.deliveryPlace || null,
              complications: p.complications || null,
            })),
          )
          .returning();
      }

      let createdContraception: any[] = [];
      if (
        Array.isArray(dto.contraceptiveHistories) &&
        dto.contraceptiveHistories.length > 0
      ) {
        createdContraception = await tx
          .insert(maternalContraceptiveHistories)
          .values(
            dto.contraceptiveHistories.map((c) => ({
              maternalIntakeId: maternalRecord.id,
              orderNumber: c.orderNumber,
              startDate: c.startDate || null,
              contraceptiveType: c.contraceptiveType || null,
              durationText: c.durationText || null,
              stopDate: c.stopDate || null,
              problems: c.problems || null,
              sideEffects: c.sideEffects || null,
            })),
          )
          .returning();
      }

      return {
        ...maternalRecord,
        intakeSubmissionId: submission.id,
        husband: createdHusband,
        anamnesisResponses: createdAnamnesisResponses,
        healthConditions: createdConditionResponses,
        previousPregnancies: createdPregnancies,
        contraceptiveHistories: createdContraception,
        answers: submission.answers,
        automatic: submission.automatic,
      };
    });
  }

  async update(id: string, dto: UpdateMaternityIntakeDto): Promise<any | null> {
    const existing = await this.db.query.maternalHealthIntakes.findFirst({
      where: or(
        eq(maternalHealthIntakes.id, id),
        eq(maternalHealthIntakes.intakeSubmissionId, id),
      ),
    });

    if (!existing) {
      throw new NotFoundException(`Maternal intake with ID '${id}' not found`);
    }

    const maternalIntakeId = existing.id;

    return await this.db.transaction(async (tx) => {
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      if (dto.motherName !== undefined) updateData.motherName = dto.motherName;
      if (dto.motherNik !== undefined) updateData.motherNik = dto.motherNik;
      if (dto.motherBirthDate !== undefined) updateData.motherBirthDate = dto.motherBirthDate;
      if (dto.motherAge !== undefined) updateData.motherAge = dto.motherAge;
      if (dto.marriageOrder !== undefined) updateData.marriageOrder = dto.marriageOrder;
      if (dto.marriageDate !== undefined) updateData.marriageDate = dto.marriageDate;
      if (dto.motherJob !== undefined) updateData.motherJob = dto.motherJob;
      if (dto.motherEducation !== undefined) updateData.motherEducation = dto.motherEducation;
      if (dto.religion !== undefined) updateData.religion = dto.religion;
      if (dto.phoneNumber !== undefined) updateData.phoneNumber = dto.phoneNumber;
      if (dto.domicileAddress !== undefined) updateData.domicileAddress = dto.domicileAddress;
      if (dto.identityCardAddress !== undefined) updateData.identityCardAddress = dto.identityCardAddress;
      if (dto.dasawisma !== undefined) updateData.dasawisma = dto.dasawisma;
      if (dto.posyandu !== undefined) updateData.posyandu = dto.posyandu;
      if (dto.puskesmas !== undefined) updateData.puskesmas = dto.puskesmas;

      if (dto.partnerName !== undefined) updateData.partnerName = dto.partnerName;
      if (dto.partnerNik !== undefined) updateData.partnerNik = dto.partnerNik;
      if (dto.partnerBirthDate !== undefined) updateData.partnerBirthDate = dto.partnerBirthDate;
      if (dto.partnerAge !== undefined) updateData.partnerAge = dto.partnerAge;
      if (dto.partnerJob !== undefined) updateData.partnerJob = dto.partnerJob;
      if (dto.partnerEducation !== undefined) updateData.partnerEducation = dto.partnerEducation;
      if (dto.partnerBloodType !== undefined) updateData.partnerBloodType = dto.partnerBloodType;

      if (dto.heightCm !== undefined) updateData.heightCm = dto.heightCm !== null ? String(dto.heightCm) : null;
      if (dto.prePregnancyWeightKg !== undefined) updateData.prePregnancyWeightKg = dto.prePregnancyWeightKg !== null ? String(dto.prePregnancyWeightKg) : null;
      if (dto.upperArmCircumferenceCm !== undefined) updateData.upperArmCircumferenceCm = dto.upperArmCircumferenceCm !== null ? String(dto.upperArmCircumferenceCm) : null;
      if (dto.initialBmi !== undefined) updateData.initialBmi = dto.initialBmi !== null ? String(dto.initialBmi) : null;
      if (dto.tetanusStatus !== undefined) updateData.tetanusStatus = dto.tetanusStatus;
      if (dto.motherBloodType !== undefined) updateData.motherBloodType = dto.motherBloodType;

      if (dto.hpht !== undefined) updateData.hpht = dto.hpht;
      if (dto.estimatedDueDate !== undefined) updateData.estimatedDueDate = dto.estimatedDueDate;
      if (dto.gestationalAgeWeeks !== undefined) updateData.gestationalAgeWeeks = dto.gestationalAgeWeeks !== null ? String(dto.gestationalAgeWeeks) : null;
      if (dto.gestationalAgeFormatted !== undefined) updateData.gestationalAgeFormatted = dto.gestationalAgeFormatted;
      if (dto.currentComplaints !== undefined) updateData.currentComplaints = dto.currentComplaints;

      if (dto.gravidaCount !== undefined) updateData.gravidaCount = dto.gravidaCount;
      if (dto.parityCount !== undefined) updateData.parityCount = dto.parityCount;
      if (dto.abortionCount !== undefined) updateData.abortionCount = dto.abortionCount;
      if (dto.livingChildrenCount !== undefined) updateData.livingChildrenCount = dto.livingChildrenCount;
      if (dto.hasPreviousPregnancyHistory !== undefined) updateData.hasPreviousPregnancyHistory = dto.hasPreviousPregnancyHistory;
      if (dto.hasContraceptionHistory !== undefined) updateData.hasContraceptionHistory = dto.hasContraceptionHistory;

      if (dto.smokedBeforePregnancy !== undefined) updateData.smokedBeforePregnancy = dto.smokedBeforePregnancy;
      if (dto.alcoholBeforePregnancy !== undefined) updateData.alcoholBeforePregnancy = dto.alcoholBeforePregnancy;
      if (dto.irregularDietBeforePregnancy !== undefined) updateData.irregularDietBeforePregnancy = dto.irregularDietBeforePregnancy;
      if (dto.reducedPhysicalActivityBeforePregnancy !== undefined) updateData.reducedPhysicalActivityBeforePregnancy = dto.reducedPhysicalActivityBeforePregnancy;
      if (dto.unprescribedMedicationBeforePregnancy !== undefined) updateData.unprescribedMedicationBeforePregnancy = dto.unprescribedMedicationBeforePregnancy;
      if (dto.concerningCosmeticUseBeforePregnancy !== undefined) updateData.concerningCosmeticUseBeforePregnancy = dto.concerningCosmeticUseBeforePregnancy;
      if (dto.pesticideExposureBeforePregnancy !== undefined) updateData.pesticideExposureBeforePregnancy = dto.pesticideExposureBeforePregnancy;
      if (dto.chemicalExposureBeforePregnancy !== undefined) updateData.chemicalExposureBeforePregnancy = dto.chemicalExposureBeforePregnancy;
      if (dto.smokeExposureBeforePregnancy !== undefined) updateData.smokeExposureBeforePregnancy = dto.smokeExposureBeforePregnancy;

      if (dto.concerningEnvironmentNotes !== undefined) updateData.concerningEnvironmentNotes = dto.concerningEnvironmentNotes;
      if (dto.allergyInfo !== undefined) updateData.allergyInfo = dto.allergyInfo;
      if (dto.otherNotes !== undefined) updateData.otherNotes = dto.otherNotes;

      await tx
        .update(maternalHealthIntakes)
        .set(updateData)
        .where(eq(maternalHealthIntakes.id, maternalIntakeId));

      // 2. Husband Profile
      if (dto.husband || dto.partnerName) {
        const husbandName = dto.husband?.fullName || dto.partnerName;
        if (husbandName) {
          const existingHusband = await tx.query.maternalHusbandProfiles.findFirst({
            where: eq(maternalHusbandProfiles.maternalIntakeId, maternalIntakeId),
          });

          const husbandData = {
            maternalIntakeId,
            fullName: husbandName,
            nik: dto.husband?.nik || dto.partnerNik,
            birthDate: dto.husband?.birthDate || dto.partnerBirthDate,
            age: dto.husband?.age || dto.partnerAge,
            job: dto.husband?.job || dto.partnerJob,
            education: dto.husband?.education || dto.partnerEducation,
            bloodType: dto.husband?.bloodType || dto.partnerBloodType,
            phoneNumber: dto.husband?.phoneNumber,
            updatedAt: new Date().toISOString(),
          };

          if (existingHusband) {
            await tx
              .update(maternalHusbandProfiles)
              .set(husbandData)
              .where(eq(maternalHusbandProfiles.id, existingHusband.id));
          } else {
            await tx.insert(maternalHusbandProfiles).values(husbandData);
          }
        }
      }

      // 3. Previous Pregnancies
      if (Array.isArray(dto.previousPregnancies)) {
        await tx
          .delete(maternalPreviousPregnancies)
          .where(eq(maternalPreviousPregnancies.maternalIntakeId, maternalIntakeId));

        if (dto.previousPregnancies.length > 0) {
          await tx.insert(maternalPreviousPregnancies).values(
            dto.previousPregnancies.map((p, idx) => ({
              maternalIntakeId,
              orderNumber: p.orderNumber || idx + 1,
              birthYear: p.birthYear || null,
              birthWeightGrams: p.birthWeightGrams || null,
              birthLengthCm: p.birthLengthCm !== undefined && p.birthLengthCm !== null ? String(p.birthLengthCm) : null,
              childSex: p.childSex || null,
              gestationalAgeAtBirth: p.gestationalAgeAtBirth || null,
              birthAttendant: p.birthAttendant || null,
              deliveryMethod: p.deliveryMethod || null,
              deliveryPlace: p.deliveryPlace || null,
              complications: p.complications || null,
            }))
          );
        }
      }

      // 4. Contraceptive Histories
      if (Array.isArray(dto.contraceptiveHistories)) {
        await tx
          .delete(maternalContraceptiveHistories)
          .where(eq(maternalContraceptiveHistories.maternalIntakeId, maternalIntakeId));

        if (dto.contraceptiveHistories.length > 0) {
          await tx.insert(maternalContraceptiveHistories).values(
            dto.contraceptiveHistories.map((c, idx) => ({
              maternalIntakeId,
              orderNumber: c.orderNumber || idx + 1,
              startDate: c.startDate || null,
              contraceptiveType: c.contraceptiveType || null,
              durationText: c.durationText || null,
              stopDate: c.stopDate || null,
              problems: c.problems || null,
              sideEffects: c.sideEffects || null,
            }))
          );
        }
      }

      // 5. Health Conditions
      if (Array.isArray(dto.healthConditions) && dto.healthConditions.length > 0) {
        const conditions = await tx.query.maternalHealthConditionCatalog.findMany();
        const cMap = new Map<string, string>(conditions.map((c) => [c.code, c.id]));

        await tx
          .delete(maternalHealthConditionResponses)
          .where(eq(maternalHealthConditionResponses.maternalIntakeId, maternalIntakeId));

        const inserts = [];
        for (const cond of dto.healthConditions) {
          const condId = cMap.get(cond.conditionCode);
          if (!condId) continue;
          inserts.push({
            maternalIntakeId,
            conditionId: condId,
            conditionCode: cond.conditionCode,
            hasCondition: cond.hasCondition,
            diagnosisYear: cond.diagnosisYear || null,
            notes: cond.notes || null,
          });
        }
        if (inserts.length > 0) {
          await tx.insert(maternalHealthConditionResponses).values(inserts);
        }
      }

      // 6. Sync JSONB answers in medicalIntakeSubmissions
      if (dto.answers && existing.intakeSubmissionId) {
        const sub = await tx.query.medicalIntakeSubmissions.findFirst({
          where: eq(medicalIntakeSubmissions.id, existing.intakeSubmissionId),
        });
        if (sub) {
          const mergedAnswers = {
            ...(sub.answers as Record<string, any>),
            ...dto.answers,
          };
          await tx
            .update(medicalIntakeSubmissions)
            .set({ answers: mergedAnswers, updatedAt: new Date().toISOString() })
            .where(eq(medicalIntakeSubmissions.id, existing.intakeSubmissionId));
        }
      }

      return await this.findById(maternalIntakeId);
    });
  }

  async findById(id: string): Promise<any | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: or(
        eq(maternalHealthIntakes.id, id),
        eq(maternalHealthIntakes.intakeSubmissionId, id),
      ),
      with: {
        husband: true,
        anamnesisResponses: {
          with: { question: true, selectedOption: true },
        },
        healthConditions: {
          with: { condition: true },
        },
        previousPregnancies: true,
        contraceptiveHistories: true,
        intakeSubmission: true,
      },
    });

    if (!record) return null;

    return {
      ...record,
      answers: record.intakeSubmission?.answers,
      automatic: record.intakeSubmission?.automatic,
    };
  }

  async findByAppointmentId(appointmentId: string): Promise<any | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: eq(maternalHealthIntakes.appointmentId, appointmentId),
      with: {
        husband: true,
        anamnesisResponses: {
          with: { question: true, selectedOption: true },
        },
        healthConditions: {
          with: { condition: true },
        },
        previousPregnancies: true,
        contraceptiveHistories: true,
        intakeSubmission: true,
      },
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });

    if (!record) return null;

    return {
      ...record,
      answers: record.intakeSubmission?.answers,
      automatic: record.intakeSubmission?.automatic,
    };
  }

  async findLatestByPatientId(patientId: string): Promise<any | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: eq(maternalHealthIntakes.patientId, patientId),
      with: {
        husband: true,
        anamnesisResponses: {
          with: { question: true, selectedOption: true },
        },
        healthConditions: {
          with: { condition: true },
        },
        previousPregnancies: true,
        contraceptiveHistories: true,
        intakeSubmission: true,
      },
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });

    if (!record) return null;

    return {
      ...record,
      answers: record.intakeSubmission?.answers,
      automatic: record.intakeSubmission?.automatic,
    };
  }

  async findMaternalHistory(
    patientIds: string[],
    query: {
      page?: number;
      limit?: number;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (patientIds && patientIds.length > 0) {
      conditions.push(inArray(maternalHealthIntakes.patientId, patientIds));
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

    if (query.startDate) {
      conditions.push(
        gte(maternalHealthIntakes.createdAt, `${query.startDate}T00:00:00Z`),
      );
    }

    if (query.endDate) {
      conditions.push(
        lte(maternalHealthIntakes.createdAt, `${query.endDate}T23:59:59Z`),
      );
    }

    const whereClause = and(...conditions);

    const [totalRes] = await this.db
      .select({ count: count() })
      .from(maternalHealthIntakes)
      .where(whereClause);

    const total = Number(totalRes?.count || 0);

    const records = await this.db.query.maternalHealthIntakes.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });

    const data = records.map((r) => ({
      id: r.id,
      intakeSubmissionId: r.intakeSubmissionId,
      patientId: r.patientId,
      appointmentId: r.appointmentId,
      motherName: r.motherName,
      motherNik: r.motherNik,
      motherBirthDate: r.motherBirthDate,
      motherAge: r.motherAge,
      gestationalAgeWeeks: r.gestationalAgeWeeks,
      gestationalAgeFormatted: r.gestationalAgeFormatted,
      hpht: r.hpht,
      estimatedDueDate: r.estimatedDueDate,
      partnerName: r.partnerName,
      gravidaCount: r.gravidaCount,
      parityCount: r.parityCount,
      abortionCount: r.abortionCount,
      livingChildrenCount: r.livingChildrenCount,
      createdAt: r.createdAt,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }
}


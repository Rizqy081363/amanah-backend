import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  childImmunizationIntakes,
  maternalContraceptiveHistories,
  maternalHealthIntakes,
  maternalPreviousPregnancies,
  medicalIntakeSubmissions,
} from '../../../../database/schema';
import { ObstetricCalculatorService } from '../../domain/services/obstetric-calculator.service';
import { CreateChildImmunizationIntakeDto } from '../../presentation/dto/create-child-immunization-intake.dto';
import { CreateMaternityIntakeDto } from '../../presentation/dto/create-maternity-intake.dto';

@Injectable()
export class KiaIntakeDrizzleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly obstetricCalculator: ObstetricCalculatorService,
  ) {}

  async createMaternalIntake(
    dto: CreateMaternityIntakeDto,
    submittedByUserId?: string,
  ): Promise<any> {
    return await this.db.transaction(async (tx) => {
      const answersMap: Record<string, any> = {
        motherName: dto.motherName,
        motherNik: dto.motherNik,
        motherBirthDate: dto.motherBirthDate,
        motherAge: dto.motherAge,
        marriageOrder: dto.marriageOrder,
        marriageDate: dto.marriageDate,
        motherJob: dto.motherJob,
        motherEducation: dto.motherEducation,
        religion: dto.religion,
        phoneNumber: dto.phoneNumber,
        domicileAddress: dto.domicileAddress,
        identityCardAddress: dto.identityCardAddress,
        dasawisma: dto.dasawisma,
        posyandu: dto.posyandu,
        puskesmas: dto.puskesmas,
        partnerName: dto.partnerName,
        partnerNik: dto.partnerNik,
        partnerBirthDate: dto.partnerBirthDate,
        partnerAge: dto.partnerAge,
        partnerJob: dto.partnerJob,
        partnerEducation: dto.partnerEducation,
        partnerBloodType: dto.partnerBloodType,
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
        smokedBeforePregnancy: dto.smokedBeforePregnancy,
        alcoholBeforePregnancy: dto.alcoholBeforePregnancy ? 'Ya' : 'Tidak',
        irregularDietBeforePregnancy: dto.irregularDietBeforePregnancy
          ? 'Ya'
          : 'Tidak',
        reducedPhysicalActivityBeforePregnancy:
          dto.reducedPhysicalActivityBeforePregnancy ? 'Ya' : 'Tidak',
        unprescribedMedicationBeforePregnancy:
          dto.unprescribedMedicationBeforePregnancy ? 'Ya' : 'Tidak',
        concerningCosmeticUseBeforePregnancy:
          dto.concerningCosmeticUseBeforePregnancy ? 'Ya' : 'Tidak',
        pesticideExposureBeforePregnancy: dto.pesticideExposureBeforePregnancy
          ? 'Ya'
          : 'Tidak',
        chemicalExposureBeforePregnancy: dto.chemicalExposureBeforePregnancy
          ? 'Ya'
          : 'Tidak',
        smokeExposureBeforePregnancy: dto.smokeExposureBeforePregnancy
          ? 'Ya'
          : 'Tidak',
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

      const [submission] = await tx
        .insert(medicalIntakeSubmissions)
        .values({
          appointmentId: dto.appointmentId || null,
          patientId: dto.patientId,
          flow: 'pregnancy',
          schemaVersion: 'v1',
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
          appointmentId: dto.appointmentId || null,
          motherNik: dto.motherNik,
          motherName: dto.motherName,
          motherBirthDate: dto.motherBirthDate || null,
          motherAge: dto.motherAge || null,
          marriageOrder: dto.marriageOrder || 1,
          marriageDate: dto.marriageDate || null,
          motherJob: dto.motherJob || null,
          motherEducation: dto.motherEducation || null,
          religion: dto.religion || null,
          phoneNumber: dto.phoneNumber,
          domicileAddress: dto.domicileAddress || null,
          identityCardAddress: dto.identityCardAddress || null,
          dasawisma: dto.dasawisma || null,
          posyandu: dto.posyandu || null,
          puskesmas: dto.puskesmas || null,
          partnerName: dto.partnerName || null,
          partnerNik: dto.partnerNik || null,
          partnerBirthDate: dto.partnerBirthDate || null,
          partnerAge: dto.partnerAge || null,
          partnerJob: dto.partnerJob || null,
          partnerEducation: dto.partnerEducation || null,
          partnerBloodType: dto.partnerBloodType || null,
          heightCm: dto.heightCm ? String(dto.heightCm) : null,
          prePregnancyWeightKg: dto.prePregnancyWeightKg
            ? String(dto.prePregnancyWeightKg)
            : null,
          upperArmCircumferenceCm: dto.upperArmCircumferenceCm
            ? String(dto.upperArmCircumferenceCm)
            : null,
          initialBmi: dto.initialBmi ? String(dto.initialBmi) : null,
          tetanusStatus: dto.tetanusStatus || null,
          motherBloodType: dto.motherBloodType || null,
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
        previousPregnancies: createdPregnancies,
        contraceptiveHistories: createdContraception,
        answers: submission.answers,
        automatic: submission.automatic,
      };
    });
  }

  async findMaternalIntakeById(id: string): Promise<any | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: or(
        eq(maternalHealthIntakes.id, id),
        eq(maternalHealthIntakes.intakeSubmissionId, id),
      ),
      with: {
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

  async findMaternalIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: eq(maternalHealthIntakes.appointmentId, appointmentId),
      with: {
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

  async createImmunizationIntake(
    dto: CreateChildImmunizationIntakeDto,
    submittedByUserId?: string,
  ): Promise<any> {
    return await this.db.transaction(async (tx) => {
      const answersMap: Record<string, any> = {
        childName: dto.childName,
        childNik: dto.childNik,
        childBirthDate: dto.childBirthDate,
        childSex: dto.childSex,
        parentPhone: dto.parentPhone,
        fatherName: dto.fatherName,
        motherName: dto.motherName,
        childAddress: dto.childAddress,
        previousVaccineHistory: dto.previousVaccineHistory,
        childAllergyHistory: dto.childAllergyHistory,
      };

      const automaticMap: Record<string, any> = {
        childAgeAtSubmit: dto.childAgeFormatted || '',
      };

      const [submission] = await tx
        .insert(medicalIntakeSubmissions)
        .values({
          appointmentId: dto.appointmentId || null,
          patientId: dto.patientId,
          flow: 'immunization',
          schemaVersion: 'v1',
          schemaTitle: 'Form Pendaftaran Imunisasi Anak - Amanah Health Care',
          answers: answersMap,
          automatic: automaticMap,
          submittedBy: submittedByUserId || null,
        })
        .returning();

      const [immRecord] = await tx
        .insert(childImmunizationIntakes)
        .values({
          intakeSubmissionId: submission.id,
          patientId: dto.patientId,
          appointmentId: dto.appointmentId || null,
          childName: dto.childName,
          childNik: dto.childNik,
          childBirthDate: dto.childBirthDate,
          childSex: dto.childSex,
          childAgeFormatted: dto.childAgeFormatted || null,
          parentPhone: dto.parentPhone,
          fatherName: dto.fatherName || null,
          motherName: dto.motherName || null,
          childAddress: dto.childAddress || null,
          previousVaccineHistory: dto.previousVaccineHistory,
          childAllergyHistory: dto.childAllergyHistory || null,
        })
        .returning();

      return {
        ...immRecord,
        intakeSubmissionId: submission.id,
        answers: submission.answers,
        automatic: submission.automatic,
      };
    });
  }

  async findImmunizationIntakeById(id: string): Promise<any | null> {
    const record = await this.db.query.childImmunizationIntakes.findFirst({
      where: or(
        eq(childImmunizationIntakes.id, id),
        eq(childImmunizationIntakes.intakeSubmissionId, id),
      ),
      with: {
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

  async findImmunizationIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    const record = await this.db.query.childImmunizationIntakes.findFirst({
      where: eq(childImmunizationIntakes.appointmentId, appointmentId),
      with: {
        intakeSubmission: true,
      },
      orderBy: [desc(childImmunizationIntakes.createdAt)],
    });

    if (!record) return null;

    return {
      ...record,
      answers: record.intakeSubmission?.answers,
      automatic: record.intakeSubmission?.automatic,
    };
  }

  async findUnifiedIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    const maternal =
      await this.findMaternalIntakeByAppointmentId(appointmentId);
    if (maternal) {
      return {
        flow: 'pregnancy',
        type: 'maternal',
        data: maternal,
      };
    }

    const immunization =
      await this.findImmunizationIntakeByAppointmentId(appointmentId);
    if (immunization) {
      return {
        flow: 'immunization',
        type: 'immunization',
        data: immunization,
      };
    }

    const genericIntake =
      await this.db.query.medicalIntakeSubmissions.findFirst({
        where: eq(medicalIntakeSubmissions.appointmentId, appointmentId),
        orderBy: [desc(medicalIntakeSubmissions.submittedAt)],
      });

    if (genericIntake) {
      return {
        flow: genericIntake.flow,
        type: 'generic',
        data: genericIntake,
      };
    }

    return null;
  }
}

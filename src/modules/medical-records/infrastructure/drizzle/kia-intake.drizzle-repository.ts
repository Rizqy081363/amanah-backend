import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  childImmunizationIntakes,
  medicalIntakeSubmissions,
} from '../../../../database/schema';
import { CreateChildImmunizationIntakeDto } from '../../presentation/dto/create-child-immunization-intake.dto';
import { CreateMaternityIntakeDto } from '../../presentation/dto/create-maternity-intake.dto';
import { MaternalIntakeDrizzleRepository } from './maternal-intake.drizzle-repository';

@Injectable()
export class KiaIntakeDrizzleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly maternalRepo: MaternalIntakeDrizzleRepository,
  ) {}

  async createMaternalIntake(
    dto: CreateMaternityIntakeDto,
    submittedByUserId?: string,
  ): Promise<any> {
    return this.maternalRepo.create(dto, submittedByUserId);
  }

  async findMaternalIntakeById(id: string): Promise<any | null> {
    return this.maternalRepo.findById(id);
  }

  async findMaternalIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    return this.maternalRepo.findByAppointmentId(appointmentId);
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

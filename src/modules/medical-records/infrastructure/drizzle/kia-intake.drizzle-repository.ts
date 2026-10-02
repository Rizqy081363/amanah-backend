import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
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
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        appointmentId,
      );
    if (!isUuid) return null;

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

    const appt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        patientProfile: {
          with: {
            patientAddresses: true,
            patientAffiliations: true,
            patientAllergies: true,
            patientEmergencyContacts: true,
          },
        },
        clinicService: true,
      },
    });

    if (appt && appt.patientProfile) {
      return {
        flow: appt.medicalFlow || 'regular',
        type: 'regular',
        data: {
          appointmentId: appt.id,
          bookingCode: appt.bookingCode,
          scheduledDate: appt.scheduledDate,
          scheduledStartTime: appt.scheduledStartTime,
          complaint: appt.complaint,
          serviceName: appt.clinicService?.name,
          patient: {
            id: appt.patientProfile.id,
            medicalRecordNumber: appt.patientProfile.medicalRecordNumber,
            fullName: appt.patientProfile.fullName,
            motherName: appt.patientProfile.motherName,
            birthPlace: appt.patientProfile.birthPlace,
            birthDate: appt.patientProfile.birthDate,
            gender: appt.patientProfile.gender,
            bloodType: appt.patientProfile.bloodType,
            occupation: appt.patientProfile.occupation,
            phone: appt.patientProfile.phone,
            email: appt.patientProfile.email,
            address:
              appt.patientProfile.patientAddresses?.[0]?.fullAddress ||
              appt.patientProfile.patientAddresses?.[0]?.line1 ||
              null,
            villageName:
              appt.patientProfile.patientAddresses?.[0]?.villageName || null,
            districtName:
              appt.patientProfile.patientAddresses?.[0]?.districtName || null,
            regencyName:
              appt.patientProfile.patientAddresses?.[0]?.regencyName || null,
            provinceName:
              appt.patientProfile.patientAddresses?.[0]?.provinceName || null,
            relationshipType:
              appt.patientProfile.patientAffiliations?.[0]?.relationshipType ||
              null,
            relationLabel:
              appt.patientProfile.patientAffiliations?.[0]?.relationLabel ||
              null,
            emergencyContactName:
              appt.patientProfile.patientEmergencyContacts?.[0]?.name || null,
            emergencyContactPhone:
              appt.patientProfile.patientEmergencyContacts?.[0]?.phone || null,
            emergencyContactRelationship:
              appt.patientProfile.patientEmergencyContacts?.[0]?.relationship ||
              null,
          },
        },
      };
    }

    return null;
  }

  async findLatestImmunizationByPatientId(
    patientId: string,
  ): Promise<any | null> {
    const record = await this.db.query.childImmunizationIntakes.findFirst({
      where: eq(childImmunizationIntakes.patientId, patientId),
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

  async findLatestIntakeByPatientId(
    patientId: string,
    flow?: string,
  ): Promise<any | null> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        patientId,
      );
    if (!isUuid) return null;

    if (flow === 'pregnancy' || flow === 'maternal') {
      const maternal = await this.maternalRepo.findLatestByPatientId(patientId);
      if (maternal) {
        return {
          flow: 'pregnancy',
          type: 'maternal',
          data: maternal,
        };
      }
      return null;
    }

    if (flow === 'immunization') {
      const immunization =
        await this.findLatestImmunizationByPatientId(patientId);
      if (immunization) {
        return {
          flow: 'immunization',
          type: 'immunization',
          data: immunization,
        };
      }
      return null;
    }

    const maternal = await this.maternalRepo.findLatestByPatientId(patientId);
    if (maternal) {
      return {
        flow: 'pregnancy',
        type: 'maternal',
        data: maternal,
      };
    }

    const immunization =
      await this.findLatestImmunizationByPatientId(patientId);
    if (immunization) {
      return {
        flow: 'immunization',
        type: 'immunization',
        data: immunization,
      };
    }

    return null;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  childImmunizationEntries,
  childImmunizationIntakes,
  medicalIntakeSubmissions,
  patientProfiles,
} from '../../../../database/schema';
import { formatBloodTypeDisplay } from '../../../patients/domain/data/patient-reference.data';
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
      const hasVaccineHistory =
        dto.hasVaccineHistory ||
        (dto.entries && dto.entries.length > 0
          ? 'Ya, pernah'
          : dto.previousVaccineHistory &&
              dto.previousVaccineHistory !==
                'Belum pernah imunisasi sama sekali'
            ? 'Ya, pernah'
            : 'Belum pernah sama sekali');

      const hasAllergyHistory =
        dto.hasAllergyHistory ||
        (dto.childAllergyHistory &&
        dto.childAllergyHistory !== 'Tidak ada riwayat alergi.'
          ? 'Ada riwayat alergi'
          : 'Tidak ada alergi');

      let targetChildName = dto.childName;
      let targetChildNik = dto.childNik;
      let targetChildBirthDate = dto.childBirthDate;
      let targetChildSex = dto.childSex;
      let targetMotherName = dto.motherName;
      let targetPhone = dto.parentPhone;

      if (
        !targetChildName ||
        !targetChildNik ||
        !targetChildBirthDate ||
        !targetChildSex ||
        !targetPhone
      ) {
        const [patient] = await tx
          .select()
          .from(patientProfiles)
          .where(eq(patientProfiles.id, dto.patientId))
          .limit(1);

        if (patient) {
          targetChildName = targetChildName || patient.fullName;
          targetChildNik =
            targetChildNik ||
            patient.nationalIdEncrypted ||
            patient.nationalIdHash ||
            undefined;
          targetChildBirthDate = targetChildBirthDate || patient.birthDate;
          targetChildSex =
            targetChildSex ||
            (patient.gender === 'female' ||
            (patient.gender as string) === 'Perempuan'
              ? 'Perempuan'
              : 'Laki-laki');
          targetMotherName =
            targetMotherName || patient.motherName || undefined;
          targetPhone = targetPhone || patient.phone || '';
        }
      }

      const answersMap: Record<string, any> = {
        childName: targetChildName,
        childNik: targetChildNik,
        childBirthDate: targetChildBirthDate,
        childSex: targetChildSex,
        childAgeFormatted: dto.childAgeFormatted || null,
        parentPhone: targetPhone,
        fatherName: dto.fatherName,
        motherName: targetMotherName,
        childAddress: dto.childAddress,
        hasVaccineHistory,
        previousVaccineHistory: dto.previousVaccineHistory,
        hasAllergyHistory,
        childAllergyHistory: dto.childAllergyHistory,
        entries: dto.entries || [],
      };

      if (Array.isArray(dto.entries)) {
        for (const entry of dto.entries) {
          const rawStatus =
            entry.status === 'GIVEN'
              ? 'Sudah'
              : entry.status === 'NOT_GIVEN'
                ? 'Belum'
                : 'Tidak tahu';
          answersMap[`vaccine_${entry.vaccineCode}_status`] = rawStatus;
          if (entry.givenDate) {
            answersMap[`vaccine_${entry.vaccineCode}_date`] = entry.givenDate;
          }
        }
      }

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
          childName: targetChildName || '',
          childNik: targetChildNik || '',
          childBirthDate: targetChildBirthDate || '',
          childSex: targetChildSex || 'Laki-laki',
          childAgeFormatted: dto.childAgeFormatted || null,
          parentPhone: targetPhone || '',
          fatherName: dto.fatherName || null,
          motherName: targetMotherName || null,
          childAddress: dto.childAddress || null,
          previousVaccineHistory: dto.previousVaccineHistory || null,
          childAllergyHistory: dto.childAllergyHistory || null,
        })
        .returning();

      let createdEntries: any[] = [];
      if (Array.isArray(dto.entries) && dto.entries.length > 0) {
        createdEntries = await tx
          .insert(childImmunizationEntries)
          .values(
            dto.entries.map((entry) => ({
              intakeId: immRecord.id,
              patientId: dto.patientId,
              vaccineCode: entry.vaccineCode,
              status: entry.status,
              givenDate: entry.givenDate || null,
              givenMonth: entry.givenMonth || null,
              ageEstimateMonths: entry.ageEstimateMonths || null,
              datePrecision: entry.datePrecision || null,
              reviewReasons: entry.reviewReasons || null,
              notes: entry.notes || null,
            })),
          )
          .returning();
      }

      return {
        ...immRecord,
        intakeSubmissionId: submission.id,
        entries: createdEntries,
        answers: submission.answers,
        automatic: submission.automatic,
      };
    });
  }

  private mapImmunizationRecord(record: any) {
    if (!record) return null;
    const answers =
      (record.intakeSubmission?.answers as Record<string, any>) || {};
    const automatic =
      (record.intakeSubmission?.automatic as Record<string, any>) || {};

    const hasVaccineHistory =
      answers.hasVaccineHistory ||
      (record.entries && record.entries.length > 0
        ? 'Ya, pernah'
        : record.previousVaccineHistory &&
            record.previousVaccineHistory !==
              'Belum pernah imunisasi sama sekali'
          ? 'Ya, pernah'
          : 'Belum pernah sama sekali');

    const hasAllergyHistory =
      answers.hasAllergyHistory ||
      (record.childAllergyHistory &&
      record.childAllergyHistory !== 'Tidak ada riwayat alergi.'
        ? 'Ada riwayat alergi'
        : 'Tidak ada alergi');

    const entriesAnswers: Record<string, any> = {};
    if (Array.isArray(record.entries)) {
      for (const entry of record.entries) {
        const code = entry.vaccineCode || entry.vaccine_code;
        if (!code) continue;
        const status =
          entry.status === 'GIVEN'
            ? 'Sudah'
            : entry.status === 'NOT_GIVEN'
              ? 'Belum'
              : 'Tidak tahu';
        entriesAnswers[`vaccine_${code}_status`] = status;
        const dateVal = entry.givenDate || entry.given_date;
        if (dateVal) {
          entriesAnswers[`vaccine_${code}_date`] = dateVal;
        }
      }
    }

    return {
      ...record,
      hasVaccineHistory,
      hasAllergyHistory,
      entries: record.entries || [],
      answers: {
        ...entriesAnswers,
        ...answers,
        hasVaccineHistory,
        hasAllergyHistory,
      },
      automatic,
    };
  }

  async findImmunizationIntakeById(id: string): Promise<any | null> {
    const record = await this.db.query.childImmunizationIntakes.findFirst({
      where: or(
        eq(childImmunizationIntakes.id, id),
        eq(childImmunizationIntakes.intakeSubmissionId, id),
      ),
      with: {
        intakeSubmission: true,
        entries: true,
      },
    });

    return this.mapImmunizationRecord(record);
  }

  async findImmunizationIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    const record = await this.db.query.childImmunizationIntakes.findFirst({
      where: eq(childImmunizationIntakes.appointmentId, appointmentId),
      with: {
        intakeSubmission: true,
        entries: true,
      },
      orderBy: [desc(childImmunizationIntakes.createdAt)],
    });

    return this.mapImmunizationRecord(record);
  }

  private mapPatientProfile(profile: any) {
    if (!profile) return null;
    const addr = profile.patientAddresses?.[0];
    const aff = profile.patientAffiliations?.[0];
    const ec = profile.patientEmergencyContacts?.[0];
    const isUnknownBlood =
      !profile.bloodType || profile.bloodType === 'unknown';

    return {
      id: profile.id,
      medicalRecordNumber: profile.medicalRecordNumber,
      nik: profile.nationalIdEncrypted || profile.nationalIdHash || '',
      fullName: profile.fullName,
      motherName: profile.motherName,
      birthPlace: profile.birthPlace,
      birthDate: profile.birthDate,
      gender: profile.gender,
      bloodType: formatBloodTypeDisplay(profile.bloodType),
      occupation: profile.occupation,
      phone: profile.phone,
      email: profile.email || aff?.user?.email || profile.user?.email || null,
      address: addr?.fullAddress || addr?.line1 || null,
      villageName: addr?.villageName || null,
      districtName: addr?.districtName || null,
      regencyName: addr?.regencyName || null,
      provinceName: addr?.provinceName || null,
      relationshipType: aff?.relationshipType || null,
      relationLabel: aff?.relationLabel || null,
      emergencyContactName: ec?.name || null,
      emergencyContactPhone: ec?.phone || null,
      emergencyContactRelationship: ec?.relationship || null,
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
      const appt = await this.db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
        with: {
          clinicService: true,
        },
      });

      return {
        flow: 'immunization',
        type: 'immunization',
        data: {
          ...immunization,
          appointmentId,
          bookingCode: appt?.bookingCode,
          scheduledDate: appt?.scheduledDate,
          scheduledStartTime: appt?.scheduledStartTime,
          complaint: appt?.complaint,
          serviceName: appt?.clinicService?.name,
        },
      };
    }

    const genericIntake =
      await this.db.query.medicalIntakeSubmissions.findFirst({
        where: eq(medicalIntakeSubmissions.appointmentId, appointmentId),
        with: {
          patientProfile: {
            with: {
              patientAddresses: true,
              patientAffiliations: {
                with: {
                  user: true,
                },
              },
              patientAllergies: true,
              patientEmergencyContacts: true,
              user: true,
            },
          },
          appointment: {
            with: {
              clinicService: true,
            },
          },
        },
        orderBy: [desc(medicalIntakeSubmissions.submittedAt)],
      });

    if (genericIntake) {
      return {
        flow: genericIntake.flow,
        type: 'generic',
        data: {
          ...genericIntake,
          serviceName: genericIntake.appointment?.clinicService?.name,
          patient: this.mapPatientProfile(genericIntake.patientProfile),
        },
      };
    }

    const appt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        patientProfile: {
          with: {
            patientAddresses: true,
            patientAffiliations: {
              with: {
                user: true,
              },
            },
            patientAllergies: true,
            patientEmergencyContacts: true,
            user: true,
          },
        },
        clinicService: true,
      },
    });

    if (appt?.patientProfile) {
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
          patient: this.mapPatientProfile(appt.patientProfile),
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
        entries: true,
      },
      orderBy: [desc(childImmunizationIntakes.createdAt)],
    });

    return this.mapImmunizationRecord(record);
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

    if (flow === 'pregnancy' || flow === 'maternal' || !flow) {
      const maternal = await this.maternalRepo.findLatestByPatientId(patientId);
      if (maternal) {
        return { flow: 'pregnancy', type: 'maternal', data: maternal };
      }
    }

    if (flow === 'immunization' || !flow) {
      const immunization =
        await this.findLatestImmunizationByPatientId(patientId);
      if (immunization) {
        return {
          flow: 'immunization',
          type: 'immunization',
          data: immunization,
        };
      }
    }

    return null;
  }
}

import { ForbiddenException, forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { and, count, desc, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  childImmunizationEntries,
  childImmunizationIntakes,
  medicalIntakeSubmissions,
  patientProfiles,
} from '../../../../database/schema';
import { AppointmentsService } from '../../../appointments/application/appointments.service';
import { formatBloodTypeDisplay } from '../../../patients/domain/data/patient-reference.data';
import { CreateChildImmunizationIntakeDto } from '../../presentation/dto/create-child-immunization-intake.dto';
import { CreateMaternityIntakeDto } from '../../presentation/dto/create-maternity-intake.dto';
import { UpdateChildImmunizationIntakeDto } from '../../presentation/dto/update-child-immunization-intake.dto';
import { UpdateMaternityIntakeDto } from '../../presentation/dto/update-maternity-intake.dto';
import { MaternalIntakeDrizzleRepository } from './maternal-intake.drizzle-repository';

@Injectable()
export class KiaIntakeDrizzleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly maternalRepo: MaternalIntakeDrizzleRepository,
    @Optional()
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService?: AppointmentsService,
  ) {}

  async createMaternalIntake(
    dto: CreateMaternityIntakeDto,
    submittedByUserId?: string,
  ): Promise<any> {
    return this.maternalRepo.create(dto, submittedByUserId);
  }

  async updateMaternalIntake(
    id: string,
    dto: UpdateMaternityIntakeDto,
  ): Promise<any> {
    return this.maternalRepo.update(id, dto);
  }

  async findMaternalIntakeById(id: string): Promise<any | null> {
    return this.maternalRepo.findById(id);
  }

  async findMaternalIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    return this.maternalRepo.findByAppointmentId(appointmentId);
  }

  async findMaternalHistory(patientIds: string[], query: any): Promise<any> {
    return this.maternalRepo.findMaternalHistory(patientIds, query);
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

  async updateImmunizationIntake(
    id: string,
    dto: UpdateChildImmunizationIntakeDto,
  ): Promise<any> {
    let targetIntakeId: string | null = null;
    await this.db.transaction(async (tx) => {
      const existing = await tx.query.childImmunizationIntakes.findFirst({
        where: or(
          eq(childImmunizationIntakes.id, id),
          eq(childImmunizationIntakes.intakeSubmissionId, id),
        ),
      });

      if (!existing) {
        return;
      }

      if (existing.intakeSubmissionId) {
        const sub = await tx.query.medicalIntakeSubmissions.findFirst({
          where: eq(medicalIntakeSubmissions.id, existing.intakeSubmissionId),
        });
        if (sub?.appointmentId) {
          const app = await tx.query.appointments.findFirst({
            where: eq(appointments.id, sub.appointmentId),
          });
          if (app?.status === 'completed') {
            throw new ForbiddenException(
              'Rekam medis pada janji temu yang telah selesai bersifat terkunci dan tidak dapat diubah.',
            );
          }
        }
      }

      const intakeId = existing.id;
      targetIntakeId = intakeId;
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      if (dto.childName !== undefined) updateData.childName = dto.childName;
      if (dto.childNik !== undefined) updateData.childNik = dto.childNik;
      if (dto.childBirthDate !== undefined)
        updateData.childBirthDate = dto.childBirthDate;
      if (dto.childSex !== undefined) updateData.childSex = dto.childSex;
      if (dto.childAgeFormatted !== undefined)
        updateData.childAgeFormatted = dto.childAgeFormatted;
      if (dto.parentPhone !== undefined) updateData.parentPhone = dto.parentPhone;
      if (dto.fatherName !== undefined) updateData.fatherName = dto.fatherName;
      if (dto.motherName !== undefined) updateData.motherName = dto.motherName;
      if (dto.childAddress !== undefined)
        updateData.childAddress = dto.childAddress;
      if (dto.previousVaccineHistory !== undefined)
        updateData.previousVaccineHistory = dto.previousVaccineHistory;
      if (dto.childAllergyHistory !== undefined)
        updateData.childAllergyHistory = dto.childAllergyHistory;

      await tx
        .update(childImmunizationIntakes)
        .set(updateData)
        .where(eq(childImmunizationIntakes.id, intakeId));

      if (Array.isArray(dto.entries)) {
        await tx
          .delete(childImmunizationEntries)
          .where(eq(childImmunizationEntries.intakeId, intakeId));

        if (dto.entries.length > 0) {
          await tx.insert(childImmunizationEntries).values(
            dto.entries.map((entry) => ({
              intakeId,
              patientId: existing.patientId,
              vaccineCode: entry.vaccineCode,
              status: entry.status,
              givenDate: entry.givenDate || null,
              givenMonth: entry.givenMonth || null,
              ageEstimateMonths: entry.ageEstimateMonths || null,
              datePrecision: entry.datePrecision || null,
              reviewReasons: entry.reviewReasons || null,
              notes: entry.notes || null,
            })),
          );
        }
      }

      if (existing.intakeSubmissionId) {
        const sub = await tx.query.medicalIntakeSubmissions.findFirst({
          where: eq(medicalIntakeSubmissions.id, existing.intakeSubmissionId),
        });
        if (sub) {
          const mergedAnswers = {
            ...(sub.answers as Record<string, any>),
            ...(dto.answers || {}),
          };
          if (dto.hasVaccineHistory !== undefined)
            mergedAnswers.hasVaccineHistory = dto.hasVaccineHistory;
          if (dto.hasAllergyHistory !== undefined)
            mergedAnswers.hasAllergyHistory = dto.hasAllergyHistory;
          if (dto.childName !== undefined) mergedAnswers.childName = dto.childName;
          if (dto.childNik !== undefined) mergedAnswers.childNik = dto.childNik;
          if (dto.childBirthDate !== undefined)
            mergedAnswers.childBirthDate = dto.childBirthDate;
          if (dto.childSex !== undefined) mergedAnswers.childSex = dto.childSex;
          if (dto.parentPhone !== undefined)
            mergedAnswers.parentPhone = dto.parentPhone;
          if (dto.fatherName !== undefined)
            mergedAnswers.fatherName = dto.fatherName;
          if (dto.motherName !== undefined)
            mergedAnswers.motherName = dto.motherName;
          if (dto.childAddress !== undefined)
            mergedAnswers.childAddress = dto.childAddress;
          if (dto.previousVaccineHistory !== undefined)
            mergedAnswers.previousVaccineHistory = dto.previousVaccineHistory;
          if (dto.childAllergyHistory !== undefined)
            mergedAnswers.childAllergyHistory = dto.childAllergyHistory;

          await tx
            .update(medicalIntakeSubmissions)
            .set({ answers: mergedAnswers, updatedAt: new Date().toISOString() })
            .where(eq(medicalIntakeSubmissions.id, existing.intakeSubmissionId));
        }
      }
    });

    if (!targetIntakeId) {
      return null;
    }

    return await this.findImmunizationIntakeById(targetIntakeId);
  }

  async updateIntakeSubmission(
    id: string,
    answers: Record<string, any>,
  ): Promise<any> {
    const existing = await this.db.query.medicalIntakeSubmissions.findFirst({
      where: eq(medicalIntakeSubmissions.id, id),
    });
    if (!existing) {
      return null;
    }
    if (existing.appointmentId) {
      const app = await this.db.query.appointments.findFirst({
        where: eq(appointments.id, existing.appointmentId),
      });
      if (app?.status === 'completed') {
        throw new ForbiddenException(
          'Rekam medis pada janji temu yang telah selesai bersifat terkunci dan tidak dapat diubah.',
        );
      }
    }
    const merged = {
      ...(existing.answers as Record<string, any>),
      ...answers,
    };
    const [updated] = await this.db
      .update(medicalIntakeSubmissions)
      .set({ answers: merged, updatedAt: new Date().toISOString() })
      .where(eq(medicalIntakeSubmissions.id, id))
      .returning();
    return updated;
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
        const code = entry.vaccineCode;
        if (!code) continue;
        const status =
          entry.status === 'GIVEN'
            ? 'Sudah'
            : entry.status === 'NOT_GIVEN'
              ? 'Belum'
              : 'Tidak tahu';
        entriesAnswers[`vaccine_${code}_status`] = status;
        const dateVal = entry.givenDate;
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

  private mapPatientProfile(profile: any, apptMetadata?: any) {
    if (!profile) return null;
    const addr = profile.patientAddresses?.[0];
    const aff = profile.patientAffiliations?.[0];
    const ec = profile.patientEmergencyContacts?.[0];

    const accountHolderName =
      apptMetadata?.parentUserName ||
      aff?.user?.name ||
      profile.user?.name ||
      null;

    const rawRelType =
      apptMetadata?.affiliationRelationship ||
      aff?.relationshipType ||
      '';
    const relType = rawRelType.toLowerCase();

    let relationshipContext: string | null = null;
    if (relType) {
      if (relType === 'self') {
        relationshipContext = 'Akun Utama (Diri Sendiri)';
      } else if (accountHolderName) {
        if (relType === 'child') {
          relationshipContext = `Anak dari ${accountHolderName}`;
        } else if (relType === 'spouse') {
          relationshipContext = `Pasangan dari ${accountHolderName}`;
        } else if (relType === 'parent') {
          relationshipContext = `Orang tua dari ${accountHolderName}`;
        } else if (relType === 'relative') {
          relationshipContext = `Kerabat dari ${accountHolderName}`;
        } else {
          relationshipContext = aff?.relationLabel
            ? `${aff.relationLabel} dari ${accountHolderName}`
            : `Keluarga dari ${accountHolderName}`;
        }
      } else {
        if (relType === 'child') relationshipContext = 'Anak';
        else if (relType === 'spouse') relationshipContext = 'Pasangan';
        else if (relType === 'parent') relationshipContext = 'Orang Tua';
        else if (relType === 'relative') relationshipContext = 'Kerabat';
        else relationshipContext = aff?.relationLabel || 'Afiliasi Keluarga';
      }
    } else if (profile.user?.id) {
      relationshipContext = 'Akun Utama (Diri Sendiri)';
    }

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
      relationshipType: relType || null,
      relationLabel: aff?.relationLabel || null,
      accountHolderName,
      relationshipContext,
      emergencyContactName: ec?.name || null,
      emergencyContactPhone: ec?.phone || null,
      emergencyContactRelationship: ec?.relationship || null,
    };
  }

  async findUnifiedIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    if (!isUUID(appointmentId)) return null;

    let fullAppt: any = null;
    if (this.appointmentsService) {
      try {
        fullAppt = await this.appointmentsService.findById(appointmentId);
      } catch {
        fullAppt = null;
      }
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
        clinicRoom: true,
        practitioner: {
          with: {
            staffProfile: true,
            medicalSpecialty: true,
          },
        },
      },
    });

    const patientData = appt?.patientProfile
      ? this.mapPatientProfile(appt.patientProfile, fullAppt)
      : null;

    const baseAppointmentData = {
      ...(fullAppt || {}),
      appointmentId: appt?.id || appointmentId,
      bookingCode: fullAppt?.bookingCode || appt?.bookingCode || null,
      queueNumber: fullAppt?.queueNumber || appt?.queueNumber || '-',
      scheduledDate: fullAppt?.appointmentDate || appt?.scheduledDate || null,
      appointmentDateFormatted:
        fullAppt?.appointmentDateFormatted || fullAppt?.appointmentDate || appt?.scheduledDate || null,
      scheduledStartTime:
        fullAppt?.scheduledStartTime || appt?.scheduledStartTime || null,
      scheduledEndTime:
        fullAppt?.scheduledEndTime || appt?.scheduledEndTime || null,
      etaRange: fullAppt?.etaRange || null,
      session: fullAppt?.session || null,
      sessionName: fullAppt?.sessionName || null,
      doctorName:
        fullAppt?.doctorName ||
        appt?.practitioner?.staffProfile?.fullName ||
        null,
      doctorSpecialty:
        fullAppt?.doctorSpecialty ||
        appt?.practitioner?.medicalSpecialty?.name ||
        null,
      roomName:
        fullAppt?.roomName ||
        appt?.clinicRoom?.name ||
        null,
      poliklinikId: fullAppt?.poliklinikId || null,
      poliklinikName:
        fullAppt?.poliklinikName ||
        null,
      layananId:
        fullAppt?.layananId ||
        appt?.serviceId ||
        appt?.clinicService?.id ||
        null,
      layananName:
        fullAppt?.layananName ||
        appt?.clinicService?.name ||
        null,
      serviceName:
        fullAppt?.layananName ||
        appt?.clinicService?.name ||
        null,
      actualStartedAt: fullAppt?.actualStartedAt || appt?.actualStartedAt || null,
      actualCompletedAt: fullAppt?.actualCompletedAt || appt?.actualCompletedAt || null,
      consultationDurationFormatted:
        fullAppt?.consultationDurationFormatted || null,
      consultationElapsedSeconds:
        fullAppt?.consultationElapsedSeconds || null,
      status: fullAppt?.status || appt?.status || 'BOOKED',
      rawStatus: fullAppt?.rawStatus || appt?.status || 'booked',
      complaint: fullAppt?.complaint || appt?.complaint || null,
      patient: patientData,
    };

    const maternal =
      await this.findMaternalIntakeByAppointmentId(appointmentId);
    if (maternal) {
      return {
        flow: 'pregnancy',
        type: 'maternal',
        data: {
          ...baseAppointmentData,
          ...maternal,
          appointmentId,
          patient: patientData,
        },
      };
    }

    const immunization =
      await this.findImmunizationIntakeByAppointmentId(appointmentId);
    if (immunization) {
      return {
        flow: 'immunization',
        type: 'immunization',
        data: {
          ...baseAppointmentData,
          ...immunization,
          appointmentId,
          patient: patientData,
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
          ...baseAppointmentData,
          ...genericIntake,
          serviceName:
            fullAppt?.layananName || genericIntake.appointment?.clinicService?.name,
          patient: patientData || this.mapPatientProfile(genericIntake.patientProfile, fullAppt),
        },
      };
    }

    if (appt?.patientProfile) {
      return {
        flow: appt.medicalFlow || 'regular',
        type: 'regular',
        data: {
          ...baseAppointmentData,
          patient: patientData,
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
    if (!isUUID(patientId)) return null;

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

  async findImmunizationHistory(
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
      conditions.push(inArray(childImmunizationIntakes.patientId, patientIds));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(childImmunizationIntakes.childName, term),
          ilike(childImmunizationIntakes.childNik, term),
        )!,
      );
    }

    if (query.startDate) {
      conditions.push(
        gte(childImmunizationIntakes.createdAt, `${query.startDate}T00:00:00Z`),
      );
    }

    if (query.endDate) {
      conditions.push(
        lte(childImmunizationIntakes.createdAt, `${query.endDate}T23:59:59Z`),
      );
    }

    const whereClause = and(...conditions);

    const [totalRes] = await this.db
      .select({ count: count() })
      .from(childImmunizationIntakes)
      .where(whereClause);

    const total = Number(totalRes?.count || 0);

    const records = await this.db.query.childImmunizationIntakes.findMany({
      where: whereClause,
      with: {
        entries: true,
      },
      limit,
      offset,
      orderBy: [desc(childImmunizationIntakes.createdAt)],
    });

    const data = records.map((r) => ({
      id: r.id,
      intakeSubmissionId: r.intakeSubmissionId,
      patientId: r.patientId,
      appointmentId: r.appointmentId,
      childName: r.childName,
      childNik: r.childNik,
      childBirthDate: r.childBirthDate,
      childSex: r.childSex,
      childAgeFormatted: r.childAgeFormatted,
      parentPhone: r.parentPhone,
      fatherName: r.fatherName,
      motherName: r.motherName,
      previousVaccineHistory: r.previousVaccineHistory,
      childAllergyHistory: r.childAllergyHistory,
      scheduledVaccinesCount: r.entries?.length || 0,
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


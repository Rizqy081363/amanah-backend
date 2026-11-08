import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  childImmunizationIntakes,
  medicalIntakeSubmissions,
  patientProfiles,
} from '../../../../database/schema/amanah.schema';
import { childImmunizationEntries } from '../../../../database/schema/immunization.schema';
import { AppointmentsService } from '../../../appointments/application/appointments.service';
import {
  IMMUNIZATION_ENTRY_STATUS,
  type ImmunizationEntryStatus,
} from '../../domain/constants/immunization.constants';
import {
  ChildImmunizationClinicalEntryEntity,
  ChildImmunizationIntakeEntity,
} from '../../domain/entities/immunization-record.entity';
import {
  CreateImmunizationIntakeData,
  IImmunizationRepository,
  ImmunizationHistoryQuery,
  PaginatedImmunizationHistory,
  SaveClinicalEntryData,
  UpdateImmunizationIntakeData,
} from '../../domain/repositories/immunization.repository.interface';
import { NikSecurityService } from '../../../../common/security/nik';

@Injectable()
export class ImmunizationDrizzleRepository implements IImmunizationRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly nikSecurity: NikSecurityService,
    @Optional()
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService?: AppointmentsService,
  ) {}

  async createIntake(
    data: CreateImmunizationIntakeData,
    submittedByUserId?: string,
  ): Promise<ChildImmunizationIntakeEntity> {
    return this.db.transaction(async (tx) => {
      // 1. Resolve patient profile fallback if fields not provided
      let targetName = data.childName?.trim();
      let targetNik = data.childNik?.trim();
      let targetBirthDate = data.childBirthDate;
      let targetSex = data.childSex;
      let targetPhone = data.parentPhone?.trim();
      let targetMotherName = data.motherName?.trim();
      let targetAddress = data.childAddress?.trim();

      if (data.line1 || data.provinceName || data.regencyName) {
        const parts = [
          data.line1?.trim(),
          data.villageName?.trim() ? `Kel. ${data.villageName.trim()}` : '',
          data.districtName?.trim() ? `Kec. ${data.districtName.trim()}` : '',
          data.regencyName?.trim(),
          data.provinceName?.trim() ? `Prov. ${data.provinceName.trim()}` : '',
        ].filter(Boolean);
        if (parts.length > 0) {
          targetAddress = parts.join(', ');
        }
      }

      const patient = await tx.query.patientProfiles.findFirst({
        where: eq(patientProfiles.id, data.patientId),
        with: {
          patientAddresses: true,
        },
      });

      if (patient) {
        if (!targetName) targetName = patient.fullName;
        if (!targetNik) {
          targetNik = patient.nationalIdEncrypted
            ? this.nikSecurity.decrypt(patient.nationalIdEncrypted) || ''
            : patient.nationalIdHash && !patient.nationalIdHash.includes(':')
              ? patient.nationalIdHash
              : '';
        }
        if (!targetBirthDate) targetBirthDate = patient.birthDate;
        if (!targetSex && patient.gender) targetSex = patient.gender;
        if (!targetPhone) targetPhone = patient.phone || '';
        if (!targetMotherName) targetMotherName = patient.motherName || '';
        if (!targetAddress && patient.patientAddresses?.[0]) {
          targetAddress =
            patient.patientAddresses[0].fullAddress ||
            patient.patientAddresses[0].line1 ||
            '';
        }
      }

      if (!targetSex) {
        throw new BadRequestException('Jenis kelamin anak (childSex) wajib diisi');
      }

      // 2. Insert intake submission metadata
      const [submission] = await tx
        .insert(medicalIntakeSubmissions)
        .values({
          appointmentId: data.appointmentId || null,
          patientId: data.patientId,
          flow: 'immunization',
          schemaVersion: 'v2',
          schemaTitle: 'Form Pendaftaran Imunisasi Anak - Amanah Health Care',
          answers: {
            childName: targetName || '',
            childNik: targetNik || '',
            childBirthDate: targetBirthDate || '',
            childSex: targetSex,
            parentPhone: targetPhone || '',
            fatherName: data.fatherName || '',
            motherName: targetMotherName || '',
            childAddress: targetAddress || '',
            previousVaccineHistory: data.previousVaccineHistory || '',
            childAllergyHistory: data.childAllergyHistory || '',
          },
          automatic: {
            childAgeAtSubmit: data.childAgeFormatted || '',
          },
          submittedBy: submittedByUserId || null,
        })
        .returning();

      // 3. Insert child immunization intake header
      const [intake] = await tx
        .insert(childImmunizationIntakes)
        .values({
          intakeSubmissionId: submission.id,
          patientId: data.patientId,
          appointmentId: data.appointmentId || null,
          childName: targetName || '',
          childNik: targetNik || '',
          childBirthDate: targetBirthDate || '',
          childSex: targetSex,
          childAgeFormatted: data.childAgeFormatted || null,
          parentPhone: targetPhone || '',
          fatherName: data.fatherName || null,
          motherName: targetMotherName || null,
          childAddress: targetAddress || null,
          previousVaccineHistory: data.previousVaccineHistory || null,
          childAllergyHistory: data.childAllergyHistory || null,
        })
        .returning();

      return intake as ChildImmunizationIntakeEntity;
    });
  }

  async updateIntake(
    id: string,
    data: UpdateImmunizationIntakeData,
  ): Promise<ChildImmunizationIntakeEntity | null> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.query.childImmunizationIntakes.findFirst({
        where: or(
          eq(childImmunizationIntakes.id, id),
          eq(childImmunizationIntakes.intakeSubmissionId, id),
        ),
      });

      if (!existing) {
        return null;
      }

      // Check appointment status lock
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

      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      if (data.childName !== undefined) updateData.childName = data.childName;
      if (data.childNik !== undefined) updateData.childNik = data.childNik;
      if (data.childBirthDate !== undefined)
        updateData.childBirthDate = data.childBirthDate;
      if (data.childSex !== undefined) updateData.childSex = data.childSex;
      if (data.childAgeFormatted !== undefined)
        updateData.childAgeFormatted = data.childAgeFormatted;
      if (data.parentPhone !== undefined)
        updateData.parentPhone = data.parentPhone;
      if (data.fatherName !== undefined) updateData.fatherName = data.fatherName;
      if (data.motherName !== undefined) updateData.motherName = data.motherName;
      if (data.childAddress !== undefined)
        updateData.childAddress = data.childAddress;
      if (
        data.line1 !== undefined ||
        data.provinceName !== undefined ||
        data.regencyName !== undefined ||
        data.districtName !== undefined ||
        data.villageName !== undefined
      ) {
        const parts = [
          data.line1?.trim(),
          data.villageName?.trim() ? `Kel. ${data.villageName.trim()}` : '',
          data.districtName?.trim() ? `Kec. ${data.districtName.trim()}` : '',
          data.regencyName?.trim(),
          data.provinceName?.trim() ? `Prov. ${data.provinceName.trim()}` : '',
        ].filter(Boolean);
        if (parts.length > 0) {
          updateData.childAddress = parts.join(', ');
        }
      }
      if (data.previousVaccineHistory !== undefined)
        updateData.previousVaccineHistory = data.previousVaccineHistory;
      if (data.childAllergyHistory !== undefined)
        updateData.childAllergyHistory = data.childAllergyHistory;

      await tx
        .update(childImmunizationIntakes)
        .set(updateData)
        .where(eq(childImmunizationIntakes.id, existing.id));

      if (data.entries && data.entries.length > 0) {
        for (const entry of data.entries) {
          const targetVaccineName = entry.vaccineName ?? '';
          const targetVaccineCode = entry.vaccineCode ?? '';

          await tx
            .insert(childImmunizationEntries)
            .values({
              patientId: existing.patientId,
              intakeId: existing.id,
              appointmentId:
                entry.appointmentId || existing.appointmentId || null,
              administeredBy: entry.administeredBy || null,
              rowIndex: entry.rowIndex,
              vaccineName: targetVaccineName,
              vaccineCode: targetVaccineCode,
              status: entry.status,
              givenDate: entry.injectionDate || null,
              ageDisplay: entry.ageDisplay || null,
              fever: entry.fever || null,
              cough: entry.cough || null,
              runnyNose: entry.runnyNose || null,
              weightKg:
                entry.weightKg !== undefined && entry.weightKg !== null
                  ? String(entry.weightKg)
                  : null,
              heightCm:
                entry.heightCm !== undefined && entry.heightCm !== null
                  ? String(entry.heightCm)
                  : null,
              headCircumferenceCm:
                entry.headCircumferenceCm !== undefined &&
                entry.headCircumferenceCm !== null
                  ? String(entry.headCircumferenceCm)
                  : null,
              temperatureCelsius:
                entry.temperatureCelsius !== undefined &&
                entry.temperatureCelsius !== null
                  ? String(entry.temperatureCelsius)
                  : null,
              planning: entry.planning || null,
              notes: entry.notes || null,
            })
            .onConflictDoUpdate({
              target: [
                childImmunizationEntries.patientId,
                childImmunizationEntries.rowIndex,
              ],
              set: {
                intakeId: existing.id,
                appointmentId:
                  entry.appointmentId ||
                  existing.appointmentId ||
                  sql`excluded.appointment_id`,
                administeredBy:
                  entry.administeredBy || sql`excluded.administered_by`,
                vaccineName: targetVaccineName,
                vaccineCode: targetVaccineCode,
                status: entry.status,
                givenDate: entry.injectionDate || null,
                ageDisplay: entry.ageDisplay || null,
                fever: entry.fever || null,
                cough: entry.cough || null,
                runnyNose: entry.runnyNose || null,
                weightKg:
                  entry.weightKg !== undefined && entry.weightKg !== null
                    ? String(entry.weightKg)
                    : null,
                heightCm:
                  entry.heightCm !== undefined && entry.heightCm !== null
                    ? String(entry.heightCm)
                    : null,
                headCircumferenceCm:
                  entry.headCircumferenceCm !== undefined &&
                  entry.headCircumferenceCm !== null
                    ? String(entry.headCircumferenceCm)
                    : null,
                temperatureCelsius:
                  entry.temperatureCelsius !== undefined &&
                  entry.temperatureCelsius !== null
                    ? String(entry.temperatureCelsius)
                    : null,
                planning: entry.planning || null,
                notes: entry.notes || null,
                updatedAt: new Date().toISOString(),
              },
            });
        }
      }

      const fullIntake = await this.findIntakeById(existing.id);
      return fullIntake as ChildImmunizationIntakeEntity;
    });
  }

  async findIntakeById(id: string): Promise<any | null> {
    const intake = await this.db.query.childImmunizationIntakes.findFirst({
      where: or(
        eq(childImmunizationIntakes.id, id),
        eq(childImmunizationIntakes.intakeSubmissionId, id),
      ),
      with: {
        intakeSubmission: true,
      },
    });

    if (!intake) return null;

    const [cumulativeLedger, patient] = await Promise.all([
      this.findChildCumulativeLedger(intake.patientId),
      this.db.query.patientProfiles.findFirst({
        where: eq(patientProfiles.id, intake.patientId),
        with: {
          patientAddresses: true,
        },
      }),
    ]);

    const dom =
      patient?.patientAddresses?.find((a) => a.type === 'domicile') ||
      patient?.patientAddresses?.[0];

    return {
      ...intake,
      line1: dom?.line1 || null,
      villageName: dom?.villageName || null,
      villageCode: dom?.villageCode || null,
      districtName: dom?.districtName || null,
      districtCode: dom?.districtCode || null,
      regencyName: dom?.regencyName || null,
      regencyCode: dom?.regencyCode || null,
      provinceName: dom?.provinceName || null,
      provinceCode: dom?.provinceCode || null,
      entries: cumulativeLedger,
      answers: (intake.intakeSubmission?.answers as Record<string, any>) || {},
      automatic:
        (intake.intakeSubmission?.automatic as Record<string, any>) || {},
    };
  }

  async findIntakeByAppointmentId(appointmentId: string): Promise<any | null> {
    const intake = await this.db.query.childImmunizationIntakes.findFirst({
      where: eq(childImmunizationIntakes.appointmentId, appointmentId),
      with: {
        intakeSubmission: true,
      },
      orderBy: [desc(childImmunizationIntakes.createdAt)],
    });

    if (!intake) return null;

    const [cumulativeLedger, patient] = await Promise.all([
      this.findChildCumulativeLedger(intake.patientId),
      this.db.query.patientProfiles.findFirst({
        where: eq(patientProfiles.id, intake.patientId),
        with: {
          patientAddresses: true,
        },
      }),
    ]);

    const dom =
      patient?.patientAddresses?.find((a) => a.type === 'domicile') ||
      patient?.patientAddresses?.[0];

    return {
      ...intake,
      line1: dom?.line1 || null,
      villageName: dom?.villageName || null,
      villageCode: dom?.villageCode || null,
      districtName: dom?.districtName || null,
      districtCode: dom?.districtCode || null,
      regencyName: dom?.regencyName || null,
      regencyCode: dom?.regencyCode || null,
      provinceName: dom?.provinceName || null,
      provinceCode: dom?.provinceCode || null,
      entries: cumulativeLedger,
      answers: (intake.intakeSubmission?.answers as Record<string, any>) || {},
      automatic:
        (intake.intakeSubmission?.automatic as Record<string, any>) || {},
    };
  }

  async findChildCumulativeLedger(
    patientId: string,
  ): Promise<ChildImmunizationClinicalEntryEntity[]> {
    const storedEntries = await this.db.query.childImmunizationEntries.findMany({
      where: eq(childImmunizationEntries.patientId, patientId),
      orderBy: [childImmunizationEntries.rowIndex],
    });

    return storedEntries.map((e) => ({
      id: e.id,
      intakeId: e.intakeId,
      patientId: e.patientId,
      appointmentId: e.appointmentId,
      administeredBy: e.administeredBy,
      rowIndex: e.rowIndex,
      vaccineName: e.vaccineName,
      vaccineCode: e.vaccineCode,
      status: e.status as ImmunizationEntryStatus,
      injectionDate: e.givenDate,
      ageDisplay: e.ageDisplay,
      fever: e.fever,
      cough: e.cough,
      runnyNose: e.runnyNose,
      weightKg: e.weightKg !== null && e.weightKg !== undefined ? Number(e.weightKg) : null,
      heightCm: e.heightCm !== null && e.heightCm !== undefined ? Number(e.heightCm) : null,
      headCircumferenceCm:
        e.headCircumferenceCm !== null && e.headCircumferenceCm !== undefined
          ? Number(e.headCircumferenceCm)
          : null,
      temperatureCelsius:
        e.temperatureCelsius !== null && e.temperatureCelsius !== undefined
          ? Number(e.temperatureCelsius)
          : null,
      planning: e.planning,
      notes: e.notes,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  async upsertClinicalEntries(
    patientId: string,
    intakeId: string,
    entries: SaveClinicalEntryData[],
    appointmentId?: string | null,
    administeredBy?: string | null,
  ): Promise<ChildImmunizationClinicalEntryEntity[]> {
    if (!entries || entries.length === 0) {
      return this.findChildCumulativeLedger(patientId);
    }

    await this.db.transaction(async (tx) => {
      for (const entry of entries) {
        const targetVaccineName = entry.vaccineName ?? '';
        const targetVaccineCode = entry.vaccineCode ?? '';

        await tx
          .insert(childImmunizationEntries)
          .values({
            patientId,
            intakeId,
            appointmentId: entry.appointmentId || appointmentId || null,
            administeredBy: entry.administeredBy || administeredBy || null,
            rowIndex: entry.rowIndex,
            vaccineName: targetVaccineName,
            vaccineCode: targetVaccineCode,
            status: entry.status,
            givenDate: entry.injectionDate || null,
            ageDisplay: entry.ageDisplay || null,
            fever: entry.fever || null,
            cough: entry.cough || null,
            runnyNose: entry.runnyNose || null,
            weightKg:
              entry.weightKg !== undefined && entry.weightKg !== null
                ? String(entry.weightKg)
                : null,
            heightCm:
              entry.heightCm !== undefined && entry.heightCm !== null
                ? String(entry.heightCm)
                : null,
            headCircumferenceCm:
              entry.headCircumferenceCm !== undefined &&
              entry.headCircumferenceCm !== null
                ? String(entry.headCircumferenceCm)
                : null,
            temperatureCelsius:
              entry.temperatureCelsius !== undefined &&
              entry.temperatureCelsius !== null
                ? String(entry.temperatureCelsius)
                : null,
            planning: entry.planning || null,
            notes: entry.notes || null,
          })
          .onConflictDoUpdate({
            target: [
              childImmunizationEntries.patientId,
              childImmunizationEntries.rowIndex,
            ],
            set: {
              intakeId,
              appointmentId:
                entry.appointmentId || appointmentId || sql`excluded.appointment_id`,
              administeredBy:
                entry.administeredBy ||
                administeredBy ||
                sql`excluded.administered_by`,
              vaccineName: targetVaccineName,
              vaccineCode: targetVaccineCode,
              status: entry.status,
              givenDate: entry.injectionDate || null,
              ageDisplay: entry.ageDisplay || null,
              fever: entry.fever || null,
              cough: entry.cough || null,
              runnyNose: entry.runnyNose || null,
              weightKg:
                entry.weightKg !== undefined && entry.weightKg !== null
                  ? String(entry.weightKg)
                  : null,
              heightCm:
                entry.heightCm !== undefined && entry.heightCm !== null
                  ? String(entry.heightCm)
                  : null,
              headCircumferenceCm:
                entry.headCircumferenceCm !== undefined &&
                entry.headCircumferenceCm !== null
                  ? String(entry.headCircumferenceCm)
                  : null,
              temperatureCelsius:
                entry.temperatureCelsius !== undefined &&
                entry.temperatureCelsius !== null
                  ? String(entry.temperatureCelsius)
                  : null,
              planning: entry.planning || null,
              notes: entry.notes || null,
              updatedAt: new Date().toISOString(),
            },
          });
      }
    });

    return this.findChildCumulativeLedger(patientId);
  }

  async findHistory(
    query: ImmunizationHistoryQuery,
  ): Promise<PaginatedImmunizationHistory> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    if (query.patientId) {
      conditions.push(eq(childImmunizationIntakes.patientId, query.patientId));
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(childImmunizationIntakes.childName, term),
          ilike(childImmunizationIntakes.childNik, term),
          ilike(childImmunizationIntakes.parentPhone, term),
        ),
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

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(childImmunizationIntakes)
      .where(whereClause);

    const total = countResult?.count || 0;

    const records = await this.db.query.childImmunizationIntakes.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [desc(childImmunizationIntakes.createdAt)],
      with: {
        intakeSubmission: true,
      },
    });

    return {
      data: records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}

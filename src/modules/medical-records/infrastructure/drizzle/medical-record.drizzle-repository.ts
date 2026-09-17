import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, ilike, lt, lte, or } from 'drizzle-orm';
import {
  ConcurrentModificationConflictException,
  generateEntityVersion,
  matchesVersion,
  PreconditionFailedException,
} from '../../../../common/occ';
import { decodeCursor, encodeCursor } from '../../../../common/pagination';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicalEncounters,
  medicalIntakeSubmissions,
  patientTimelineEvents,
  practitioners,
} from '../../../../database/schema';
import { MedicalIntakeSubmissionEntity } from '../../domain/entities/medical-intake.entity';
import {
  MedicalRecordEntity,
  VitalSigns,
} from '../../domain/entities/medical-record.entity';
import {
  MedicalRecordFilterOptions,
  MedicalRecordRepository,
  UpdateDiagnosisData,
} from '../../domain/repositories/medical-record.repository';

@Injectable()
export class MedicalRecordDrizzleRepository implements MedicalRecordRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(r: any): MedicalRecordEntity {
    let parsedPlan: Record<string, any> = {};
    if (r.plan) {
      try {
        parsedPlan = JSON.parse(r.plan);
      } catch {
        parsedPlan = { tindakan: r.plan };
      }
    }

    let vitalSigns: VitalSigns | null = parsedPlan.vitalSigns || null;
    if (!vitalSigns && r.objectiveNotes) {
      try {
        const parsed = JSON.parse(r.objectiveNotes);
        if (typeof parsed === 'object' && parsed !== null) {
          vitalSigns = parsed;
        }
      } catch {
        // Not a JSON vitalSigns string, keep as null
      }
    }

    return {
      id: r.id,
      kunjunganId: r.appointmentId || null,
      patientId: r.patientId,
      staffId: r.practitionerId || null,
      serviceId: r.serviceId || null,
      sourceIntakeId: r.sourceIntakeId || null,
      encounterDate: r.encounterDate,
      status: r.status,

      // SOAP Components
      subjective: r.subjectiveNotes || parsedPlan.subjective || null,
      objectiveNotes: r.objectiveNotes || parsedPlan.objectiveNotes || null,
      vitalSigns,
      diagnosis: r.assessment || parsedPlan.diagnosis || null,
      diagnosisIcd10Code: parsedPlan.diagnosisIcd10Code || null,
      diagnosisIcd10Name: parsedPlan.diagnosisIcd10Name || null,
      tindakan: parsedPlan.tindakan || null,
      resepObat: parsedPlan.resepObat || null,
      prescriptions: parsedPlan.prescriptions || null,
      catatanMedis: parsedPlan.catatanMedis || null,

      // KIA / Flow
      flowType: parsedPlan.flowType || 'general',
      motherNik: parsedPlan.motherNik || null,
      partnerNik: parsedPlan.partnerNik || null,
      childNik: parsedPlan.childNik || null,
      formData: parsedPlan.formData || {},
      computedData: parsedPlan.computedData || {},

      // Hydrated Relations
      patient: r.patientProfile
        ? {
            id: r.patientProfile.id,
            fullName: r.patientProfile.fullName,
            medicalRecordNumber: r.patientProfile.medicalRecordNumber,
            nik:
              r.patientProfile.nationalIdEncrypted ||
              r.patientProfile.nationalIdHash ||
              null,
            gender: r.patientProfile.gender,
            birthDate: r.patientProfile.birthDate,
            phone: r.patientProfile.phone,
          }
        : null,
      practitioner: r.practitioner
        ? {
            id: r.practitioner.id,
            fullName: r.practitioner.staffProfile?.fullName || '',
            profession: r.practitioner.staffProfile?.positionTitle || null,
            staffCode: r.practitioner.staffProfile?.staffCode || null,
            sipNumber: null,
          }
        : null,
      service: r.clinicService
        ? {
            id: r.clinicService.id,
            name: r.clinicService.name,
            serviceCode: r.clinicService.serviceCode || null,
          }
        : null,

      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
      version: generateEntityVersion(r.updatedAt),
    };
  }

  private mapIntakeToEntity(i: any): MedicalIntakeSubmissionEntity {
    return {
      id: i.id,
      appointmentId: i.appointmentId || null,
      patientId: i.patientId,
      flow: i.flow,
      schemaVersion: i.schemaVersion,
      schemaTitle: i.schemaTitle,
      answers: i.answers || {},
      automatic: i.automatic || {},
      submittedBy: i.submittedBy || null,
      submittedAt: new Date(i.submittedAt),
      createdAt: new Date(i.createdAt),
      updatedAt: new Date(i.updatedAt),
    };
  }

  async create(
    data: Omit<
      MedicalRecordEntity,
      'id' | 'createdAt' | 'updatedAt' | 'patient' | 'practitioner' | 'service'
    >,
    createdByUserId?: string,
  ): Promise<MedicalRecordEntity> {
    const details = {
      flowType: data.flowType || 'general',
      motherNik: data.motherNik || null,
      partnerNik: data.partnerNik || null,
      childNik: data.childNik || null,
      formData: data.formData || {},
      computedData: data.computedData || {},
      subjective: data.subjective || null,
      objectiveNotes: data.objectiveNotes || null,
      vitalSigns: data.vitalSigns || null,
      diagnosis: data.diagnosis || null,
      diagnosisIcd10Code: data.diagnosisIcd10Code || null,
      diagnosisIcd10Name: data.diagnosisIcd10Name || null,
      tindakan: data.tindakan || null,
      resepObat: data.resepObat || null,
      prescriptions: data.prescriptions || null,
      catatanMedis: data.catatanMedis || null,
    };

    let serviceId = data.serviceId || null;
    let appointmentDate =
      data.encounterDate || new Date().toISOString().split('T')[0];

    if (data.kunjunganId) {
      const apt = await this.db.query.appointments.findFirst({
        where: eq(appointments.id, data.kunjunganId),
      });
      if (apt) {
        if (!serviceId) serviceId = apt.serviceId;
        if (!data.encounterDate && apt.scheduledDate) {
          appointmentDate = apt.scheduledDate;
        }
      }
    }

    let practitionerId: string | null = null;
    if (data.staffId) {
      const prac = await this.db.query.practitioners.findFirst({
        where: or(
          eq(practitioners.id, data.staffId),
          eq(practitioners.staffProfileId, data.staffId),
        ),
      });
      practitionerId = prac ? prac.id : data.staffId;
    }

    let assessmentText = data.diagnosis || null;
    if (data.diagnosisIcd10Code) {
      assessmentText = data.diagnosisIcd10Name
        ? `${data.diagnosisIcd10Code} - ${data.diagnosisIcd10Name}`
        : data.diagnosisIcd10Code;
      if (data.diagnosis && data.diagnosis !== assessmentText) {
        assessmentText = `${data.diagnosis} (${assessmentText})`;
      }
    }

    let objectiveText = data.objectiveNotes || null;
    if (!objectiveText && data.vitalSigns) {
      objectiveText = JSON.stringify(data.vitalSigns);
    }

    const [record] = await this.db
      .insert(clinicalEncounters)
      .values({
        appointmentId: data.kunjunganId || null,
        patientId: data.patientId,
        practitionerId: practitionerId || null,
        serviceId: serviceId || null,
        sourceIntakeId: data.sourceIntakeId || null,
        encounterDate: appointmentDate,
        status: data.status || 'completed',
        subjectiveNotes: data.subjective || null,
        objectiveNotes: objectiveText,
        assessment: assessmentText,
        plan: JSON.stringify(details),
        createdBy: createdByUserId || null,
      })
      .returning();

    // Log patient timeline event if completed
    try {
      await this.db.insert(patientTimelineEvents).values({
        patientId: data.patientId,
        appointmentId: data.kunjunganId || null,
        eventType: 'encounter_completed',
        title: 'Pemeriksaan Medis Selesai',
        subtitle: assessmentText || 'Pemeriksaan Rutin',
        eventAt: new Date().toISOString(),
        iconType: 'stethoscope',
        actionLabel: 'Lihat Rekam Medis',
        metadata: {
          encounterId: record.id,
          flowType: data.flowType,
          status: record.status,
        },
      });
    } catch {
      // Non-blocking timeline log
    }

    return (await this.findById(record.id)) || this.mapRecordToEntity(record);
  }

  async findById(id: string): Promise<MedicalRecordEntity | null> {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      return null;
    }
    const record = await this.db.query.clinicalEncounters.findFirst({
      where: eq(clinicalEncounters.id, id),
      with: {
        patientProfile: true,
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicService: true,
      },
    });

    return record ? this.mapRecordToEntity(record) : null;
  }

  async findAll(filters?: MedicalRecordFilterOptions): Promise<{
    data: MedicalRecordEntity[];
    total: number;
    page: number;
    limit: number;
    meta: {
      nextCursor: string | null;
      hasNextPage: boolean;
      limit: number;
      total: number;
      page: number;
      totalPages: number;
    };
  }> {
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 20;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters?.patientId) {
      conditions.push(eq(clinicalEncounters.patientId, filters.patientId));
    }
    if (filters?.practitionerId) {
      conditions.push(
        eq(clinicalEncounters.practitionerId, filters.practitionerId),
      );
    }
    if (filters?.serviceId) {
      conditions.push(eq(clinicalEncounters.serviceId, filters.serviceId));
    }
    if (filters?.status) {
      conditions.push(eq(clinicalEncounters.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(clinicalEncounters.encounterDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(clinicalEncounters.encounterDate, filters.endDate));
    }
    if (filters?.search) {
      const s = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(clinicalEncounters.assessment, s),
          ilike(clinicalEncounters.subjectiveNotes, s),
          ilike(clinicalEncounters.plan, s),
        ),
      );
    }

    if (filters?.cursor) {
      const cursorPayload = decodeCursor(filters.cursor);
      const cursorIso = cursorPayload.createdAt.toISOString();
      conditions.push(
        or(
          lt(clinicalEncounters.createdAt, cursorIso),
          and(
            eq(clinicalEncounters.createdAt, cursorIso),
            lt(clinicalEncounters.id, cursorPayload.id),
          ),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRes = await this.db
      .select({ count: count() })
      .from(clinicalEncounters)
      .where(whereClause);
    const total = Number(totalRes[0]?.count || 0);

    const fetchLimit = limit + 1;
    const records = await this.db.query.clinicalEncounters.findMany({
      where: whereClause,
      with: {
        patientProfile: true,
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicService: true,
      },
      orderBy: [
        desc(clinicalEncounters.encounterDate),
        desc(clinicalEncounters.createdAt),
        desc(clinicalEncounters.id),
      ],
      limit: fetchLimit,
      offset: filters?.cursor ? 0 : offset,
    });

    const hasNextPage = records.length > limit;
    const pageRecords = hasNextPage ? records.slice(0, limit) : records;
    let nextCursor: string | null = null;
    if (hasNextPage && pageRecords.length > 0) {
      const lastItem = pageRecords[pageRecords.length - 1];
      nextCursor = encodeCursor({
        createdAt: lastItem.createdAt,
        id: lastItem.id,
      });
    }

    return {
      data: pageRecords.map((r) => this.mapRecordToEntity(r)),
      total,
      page,
      limit,
      meta: {
        nextCursor,
        hasNextPage,
        limit,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByKunjunganId(
    kunjunganId: string,
  ): Promise<MedicalRecordEntity | null> {
    if (
      !kunjunganId ||
      typeof kunjunganId !== 'string' ||
      kunjunganId.trim() === ''
    ) {
      return null;
    }
    const record = await this.db.query.clinicalEncounters.findFirst({
      where: eq(clinicalEncounters.appointmentId, kunjunganId),
      with: {
        patientProfile: true,
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicService: true,
      },
    });

    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByPatientId(patientId: string): Promise<MedicalRecordEntity[]> {
    if (
      !patientId ||
      typeof patientId !== 'string' ||
      patientId.trim() === ''
    ) {
      return [];
    }
    const records = await this.db.query.clinicalEncounters.findMany({
      where: eq(clinicalEncounters.patientId, patientId),
      with: {
        patientProfile: true,
        practitioner: {
          with: {
            staffProfile: true,
          },
        },
        clinicService: true,
      },
      orderBy: [
        desc(clinicalEncounters.encounterDate),
        desc(clinicalEncounters.createdAt),
      ],
    });

    return records.map((r) => this.mapRecordToEntity(r));
  }

  async update(
    id: string,
    data: Partial<MedicalRecordEntity>,
    expectedVersion?: string,
  ): Promise<MedicalRecordEntity | null> {
    const existing = await this.db.query.clinicalEncounters.findFirst({
      where: eq(clinicalEncounters.id, id),
    });
    if (!existing) return null;

    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== ''
    ) {
      const currentVersion = generateEntityVersion(existing.updatedAt);
      if (
        !matchesVersion(expectedVersion, currentVersion, existing.updatedAt)
      ) {
        throw new PreconditionFailedException(
          currentVersion,
          expectedVersion,
          `Precondition failed: Medical record with ID ${id} has been modified since version "${expectedVersion}". Current version is "${currentVersion}".`,
        );
      }
    }

    let parsedPlan: Record<string, any> = {};
    if (existing.plan) {
      try {
        parsedPlan = JSON.parse(existing.plan);
      } catch {
        parsedPlan = {};
      }
    }

    if (data.flowType !== undefined) parsedPlan.flowType = data.flowType;
    if (data.motherNik !== undefined) parsedPlan.motherNik = data.motherNik;
    if (data.partnerNik !== undefined) parsedPlan.partnerNik = data.partnerNik;
    if (data.childNik !== undefined) parsedPlan.childNik = data.childNik;
    if (data.formData !== undefined) parsedPlan.formData = data.formData;
    if (data.computedData !== undefined)
      parsedPlan.computedData = data.computedData;
    if (data.subjective !== undefined) parsedPlan.subjective = data.subjective;
    if (data.objectiveNotes !== undefined)
      parsedPlan.objectiveNotes = data.objectiveNotes;
    if (data.vitalSigns !== undefined) parsedPlan.vitalSigns = data.vitalSigns;
    if (data.diagnosis !== undefined) parsedPlan.diagnosis = data.diagnosis;
    if (data.diagnosisIcd10Code !== undefined)
      parsedPlan.diagnosisIcd10Code = data.diagnosisIcd10Code;
    if (data.diagnosisIcd10Name !== undefined)
      parsedPlan.diagnosisIcd10Name = data.diagnosisIcd10Name;
    if (data.tindakan !== undefined) parsedPlan.tindakan = data.tindakan;
    if (data.resepObat !== undefined) parsedPlan.resepObat = data.resepObat;
    if (data.prescriptions !== undefined)
      parsedPlan.prescriptions = data.prescriptions;
    if (data.catatanMedis !== undefined)
      parsedPlan.catatanMedis = data.catatanMedis;

    let assessment = existing.assessment;
    if (data.diagnosis !== undefined) {
      assessment = data.diagnosis;
      if (data.diagnosisIcd10Code) {
        assessment = `${data.diagnosis} (${data.diagnosisIcd10Code})`;
      }
    }

    let practitionerId = existing.practitionerId;
    if (data.staffId) {
      const prac = await this.db.query.practitioners.findFirst({
        where: or(
          eq(practitioners.id, data.staffId),
          eq(practitioners.staffProfileId, data.staffId),
        ),
      });
      practitionerId = prac ? prac.id : data.staffId;
    }

    const whereConditions = [eq(clinicalEncounters.id, id)];
    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== ''
    ) {
      whereConditions.push(
        eq(clinicalEncounters.updatedAt, existing.updatedAt),
      );
    }

    const [updatedRow] = await this.db
      .update(clinicalEncounters)
      .set({
        subjectiveNotes:
          data.subjective !== undefined
            ? data.subjective
            : existing.subjectiveNotes,
        objectiveNotes:
          data.objectiveNotes !== undefined
            ? data.objectiveNotes
            : existing.objectiveNotes,
        assessment,
        plan: JSON.stringify(parsedPlan),
        status: data.status !== undefined ? data.status : existing.status,
        practitionerId,
        serviceId:
          data.serviceId !== undefined ? data.serviceId : existing.serviceId,
        encounterDate:
          data.encounterDate !== undefined
            ? data.encounterDate
            : existing.encounterDate,
        updatedAt: new Date().toISOString(),
      })
      .where(and(...whereConditions))
      .returning();

    if (!updatedRow) {
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        expectedVersion !== ''
      ) {
        const latest = await this.db.query.clinicalEncounters.findFirst({
          where: eq(clinicalEncounters.id, id),
        });
        if (latest) {
          const latestVersion = generateEntityVersion(latest.updatedAt);
          throw new ConcurrentModificationConflictException(
            latestVersion,
            `Concurrent modification detected: Medical record with ID ${id} was modified by another transaction. Current version is "${latestVersion}".`,
          );
        }
      }
      return null;
    }

    return this.findById(id);
  }

  async updateDiagnosis(
    id: string,
    data: UpdateDiagnosisData,
    expectedVersion?: string,
  ): Promise<MedicalRecordEntity | null> {
    const existing = await this.db.query.clinicalEncounters.findFirst({
      where: eq(clinicalEncounters.id, id),
    });
    if (!existing) return null;

    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== ''
    ) {
      const currentVersion = generateEntityVersion(existing.updatedAt);
      if (
        !matchesVersion(expectedVersion, currentVersion, existing.updatedAt)
      ) {
        throw new PreconditionFailedException(
          currentVersion,
          expectedVersion,
          `Precondition failed: Medical record with ID ${id} has been modified since version "${expectedVersion}". Current version is "${currentVersion}".`,
        );
      }
    }

    let parsedPlan: Record<string, any> = {};
    if (existing.plan) {
      try {
        parsedPlan = JSON.parse(existing.plan);
      } catch {
        parsedPlan = {};
      }
    }

    if (data.diagnosis !== undefined) parsedPlan.diagnosis = data.diagnosis;
    if (data.diagnosisIcd10Code !== undefined)
      parsedPlan.diagnosisIcd10Code = data.diagnosisIcd10Code;
    if (data.diagnosisIcd10Name !== undefined)
      parsedPlan.diagnosisIcd10Name = data.diagnosisIcd10Name;
    if (data.tindakan !== undefined) parsedPlan.tindakan = data.tindakan;
    if (data.resepObat !== undefined) parsedPlan.resepObat = data.resepObat;
    if (data.prescriptions !== undefined)
      parsedPlan.prescriptions = data.prescriptions;
    if (data.catatanMedis !== undefined)
      parsedPlan.catatanMedis = data.catatanMedis;

    let assessment = existing.assessment;
    if (data.diagnosis !== undefined) {
      assessment = data.diagnosis;
      if (data.diagnosisIcd10Code) {
        assessment = `${data.diagnosis} (${data.diagnosisIcd10Code})`;
      }
    }

    let practitionerId = existing.practitionerId;
    if (data.staffId) {
      const prac = await this.db.query.practitioners.findFirst({
        where: or(
          eq(practitioners.id, data.staffId),
          eq(practitioners.staffProfileId, data.staffId),
        ),
      });
      practitionerId = prac ? prac.id : data.staffId;
    }

    const whereConditions = [eq(clinicalEncounters.id, id)];
    if (
      expectedVersion !== undefined &&
      expectedVersion !== null &&
      expectedVersion !== ''
    ) {
      whereConditions.push(
        eq(clinicalEncounters.updatedAt, existing.updatedAt),
      );
    }

    const [updatedRow] = await this.db
      .update(clinicalEncounters)
      .set({
        assessment,
        plan: JSON.stringify(parsedPlan),
        status: data.status !== undefined ? data.status : existing.status,
        practitionerId,
        updatedAt: new Date().toISOString(),
      })
      .where(and(...whereConditions))
      .returning();

    if (!updatedRow) {
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        expectedVersion !== ''
      ) {
        const latest = await this.db.query.clinicalEncounters.findFirst({
          where: eq(clinicalEncounters.id, id),
        });
        if (latest) {
          const latestVersion = generateEntityVersion(latest.updatedAt);
          throw new ConcurrentModificationConflictException(
            latestVersion,
            `Concurrent modification detected: Medical record with ID ${id} was modified by another transaction. Current version is "${latestVersion}".`,
          );
        }
      }
      return null;
    }

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .delete(clinicalEncounters)
      .where(eq(clinicalEncounters.id, id))
      .returning();
    return res.length > 0;
  }

  // Medical Intake Submissions
  async createIntake(
    data: Omit<
      MedicalIntakeSubmissionEntity,
      'id' | 'createdAt' | 'updatedAt' | 'submittedAt'
    >,
    submittedByUserId?: string,
  ): Promise<MedicalIntakeSubmissionEntity> {
    const [intake] = await this.db
      .insert(medicalIntakeSubmissions)
      .values({
        appointmentId: data.appointmentId || null,
        patientId: data.patientId,
        flow: data.flow,
        schemaVersion: data.schemaVersion || 'v1',
        schemaTitle: data.schemaTitle,
        answers: data.answers,
        automatic: data.automatic || {},
        submittedBy: submittedByUserId || null,
      })
      .returning();

    return this.mapIntakeToEntity(intake);
  }

  async findIntakeById(
    id: string,
  ): Promise<MedicalIntakeSubmissionEntity | null> {
    const intake = await this.db.query.medicalIntakeSubmissions.findFirst({
      where: eq(medicalIntakeSubmissions.id, id),
    });

    return intake ? this.mapIntakeToEntity(intake) : null;
  }

  async findIntakesByPatientId(
    patientId: string,
  ): Promise<MedicalIntakeSubmissionEntity[]> {
    const intakes = await this.db.query.medicalIntakeSubmissions.findMany({
      where: eq(medicalIntakeSubmissions.patientId, patientId),
      orderBy: [desc(medicalIntakeSubmissions.submittedAt)],
    });

    return intakes.map((i) => this.mapIntakeToEntity(i));
  }
}

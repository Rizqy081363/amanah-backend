import { Inject, Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicalEncounters,
  practitioners,
} from '../../../../database/schema';
import { MedicalRecordEntity } from '../../domain/entities/medical-record.entity';
import { MedicalRecordRepository } from '../../domain/repositories/medical-record.repository';

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

    return {
      id: r.id,
      kunjunganId: r.appointmentId || '',
      patientId: r.patientId,
      staffId: r.practitionerId || null,
      flowType: parsedPlan.flowType || 'general',
      motherNik: parsedPlan.motherNik || null,
      partnerNik: parsedPlan.partnerNik || null,
      childNik: parsedPlan.childNik || null,
      formData: parsedPlan.formData || {},
      computedData: parsedPlan.computedData || {},
      diagnosis: r.assessment || null,
      tindakan: parsedPlan.tindakan || null,
      resepObat: parsedPlan.resepObat || null,
      catatanMedis: parsedPlan.catatanMedis || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async create(
    data: Omit<MedicalRecordEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<MedicalRecordEntity> {
    const details = {
      flowType: data.flowType,
      motherNik: data.motherNik,
      partnerNik: data.partnerNik,
      childNik: data.childNik,
      formData: data.formData || {},
      computedData: data.computedData || {},
      tindakan: data.tindakan,
      resepObat: data.resepObat,
      catatanMedis: data.catatanMedis,
    };

    let serviceId: string | null = null;
    let appointmentDate = new Date().toISOString().split('T')[0];

    if (data.kunjunganId) {
      const apt = await this.db.query.appointments.findFirst({
        where: eq(appointments.id, data.kunjunganId),
      });
      if (apt) {
        serviceId = apt.serviceId;
        appointmentDate = apt.scheduledDate;
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

    const [record] = await this.db
      .insert(clinicalEncounters)
      .values({
        appointmentId: data.kunjunganId || null,
        patientId: data.patientId,
        practitionerId: practitionerId || null,
        serviceId: serviceId || null,
        encounterDate: appointmentDate,
        status: 'completed',
        assessment: data.diagnosis || null,
        plan: JSON.stringify(details),
      })
      .returning();

    return this.mapRecordToEntity(record);
  }

  async findByKunjunganId(
    kunjunganId: string,
  ): Promise<MedicalRecordEntity | null> {
    const record = await this.db.query.clinicalEncounters.findFirst({
      where: eq(clinicalEncounters.appointmentId, kunjunganId),
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByPatientId(patientId: string): Promise<MedicalRecordEntity[]> {
    const records = await this.db.query.clinicalEncounters.findMany({
      where: eq(clinicalEncounters.patientId, patientId),
    });
    return records.map((r) => this.mapRecordToEntity(r));
  }

  async updateDiagnosis(
    id: string,
    data: {
      staffId?: string;
      diagnosis?: string;
      tindakan?: string;
      resepObat?: string;
      catatanMedis?: string;
    },
  ): Promise<MedicalRecordEntity | null> {
    const existing = await this.db.query.clinicalEncounters.findFirst({
      where: eq(clinicalEncounters.id, id),
    });
    if (!existing) return null;

    let parsedPlan: Record<string, any> = {};
    if (existing.plan) {
      try {
        parsedPlan = JSON.parse(existing.plan);
      } catch {
        parsedPlan = {};
      }
    }

    if (data.tindakan !== undefined) parsedPlan.tindakan = data.tindakan;
    if (data.resepObat !== undefined) parsedPlan.resepObat = data.resepObat;
    if (data.catatanMedis !== undefined)
      parsedPlan.catatanMedis = data.catatanMedis;

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

    const [updated] = await this.db
      .update(clinicalEncounters)
      .set({
        assessment:
          data.diagnosis !== undefined ? data.diagnosis : existing.assessment,
        plan: JSON.stringify(parsedPlan),
        practitionerId: practitionerId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(clinicalEncounters.id, id))
      .returning();

    return updated ? this.mapRecordToEntity(updated) : null;
  }
}

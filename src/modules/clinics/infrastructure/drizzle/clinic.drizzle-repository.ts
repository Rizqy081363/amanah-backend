import { Inject, Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { clinicServices, clinicUnits } from '../../../../database/schema';
import {
  LayananPoliEntity,
  PoliklinikEntity,
} from '../../domain/entities/clinic.entity';
import { ClinicRepository } from '../../domain/repositories/clinic.repository';

@Injectable()
export class ClinicDrizzleRepository implements ClinicRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redis: RedisService,
  ) {}

  private mapUnitToPoli(r: typeof clinicUnits.$inferSelect): PoliklinikEntity {
    const upperCode =
      r.code === 'poli_umum'
        ? 'POLI-UMUM'
        : r.code === 'poli_kia'
          ? 'POLI-KIA'
          : r.code.toUpperCase().replace(/_/g, '-');

    return {
      id: r.id,
      namaPoli: r.name,
      kodePoli: upperCode,
      deskripsi: r.location || null,
      isActive: r.isActive,
      createdAt: new Date(r.createdAt),
    };
  }

  async createPoliklinik(data: {
    namaPoli: string;
    kodePoli: string;
    deskripsi?: string | null;
    isActive?: boolean;
  }): Promise<PoliklinikEntity> {
    const normalizedCode = data.kodePoli.toLowerCase().replace(/-/g, '_');
    const [record] = await this.db
      .insert(clinicUnits)
      .values({
        code: normalizedCode,
        name: data.namaPoli,
        unitType: 'polyclinic',
        location: data.deskripsi || null,
        isActive: data.isActive ?? true,
      })
      .returning();

    await this.redis.del('clinics:poliklinik:all');
    return this.mapUnitToPoli(record);
  }

  async findAllPoliklinik(): Promise<PoliklinikEntity[]> {
    return this.redis.getOrSet(
      'clinics:poliklinik:all',
      async () => {
        const records = await this.db.query.clinicUnits.findMany({
          where: eq(clinicUnits.isActive, true),
        });
        const polis = records
          .filter(
            (u) => u.unitType === 'polyclinic' || u.code.startsWith('poli_'),
          )
          .map((r) => this.mapUnitToPoli(r));
        return polis;
      },
      600, // 10 minutes cache
    );
  }

  async findPoliklinikById(id: string): Promise<PoliklinikEntity | null> {
    const record = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, id),
    });
    if (!record) return null;
    return this.mapUnitToPoli(record);
  }

  async findPoliklinikByKode(kode: string): Promise<PoliklinikEntity | null> {
    const normalized = kode.toLowerCase().replace(/-/g, '_');
    const record = await this.db.query.clinicUnits.findFirst({
      where: or(
        eq(clinicUnits.code, kode.toLowerCase()),
        eq(clinicUnits.code, normalized),
      ),
    });
    if (!record) return null;
    return this.mapUnitToPoli(record);
  }

  async updatePoliklinik(
    id: string,
    data: Partial<PoliklinikEntity>,
  ): Promise<PoliklinikEntity | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.namaPoli !== undefined) updateValues.name = data.namaPoli;
    if (data.deskripsi !== undefined) updateValues.location = data.deskripsi;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;

    const [updated] = await this.db
      .update(clinicUnits)
      .set(updateValues)
      .where(eq(clinicUnits.id, id))
      .returning();

    await this.redis.del('clinics:poliklinik:all');
    return updated ? this.mapUnitToPoli(updated) : null;
  }

  async deletePoliklinik(id: string): Promise<boolean> {
    await this.db
      .update(clinicUnits)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(clinicUnits.id, id));

    await this.redis.del('clinics:poliklinik:all');
    return true;
  }

  async createLayanan(
    poliklinikId: string,
    data: {
      namaLayanan: string;
      deskripsi?: string | null;
      medicalFlow?: 'general' | 'pregnancy' | 'immunization';
    },
  ): Promise<LayananPoliEntity> {
    const slug = data.namaLayanan
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 30);
    const code = `srv_${slug}_${Date.now().toString().slice(-4)}`;
    const prefix =
      data.medicalFlow === 'pregnancy'
        ? 'KIA'
        : data.medicalFlow === 'immunization'
          ? 'IM'
          : 'UM';

    const [record] = await this.db
      .insert(clinicServices)
      .values({
        code,
        name: data.namaLayanan,
        description: data.deskripsi || null,
        codePrefix: prefix,
        medicalFlow:
          data.medicalFlow === 'pregnancy' ||
          data.medicalFlow === 'immunization'
            ? data.medicalFlow
            : null,
        isBookable: true,
        isActive: true,
      })
      .returning();

    await this.redis.del(`clinics:layanan:poli:${poliklinikId}`);
    return {
      id: record.id,
      poliklinikId,
      namaLayanan: record.name,
      deskripsi: record.description || null,
      medicalFlow: (record.medicalFlow as any) || 'general',
      isActive: record.isActive,
      createdAt: new Date(record.createdAt),
    };
  }

  async findLayananByPoliId(
    poliklinikId: string,
  ): Promise<LayananPoliEntity[]> {
    return this.redis.getOrSet(
      `clinics:layanan:poli:${poliklinikId}`,
      async () => {
        const unit = await this.db.query.clinicUnits.findFirst({
          where: eq(clinicUnits.id, poliklinikId),
        });

        const allServices = await this.db.query.clinicServices.findMany({
          where: eq(clinicServices.isActive, true),
        });

        let filtered = allServices;
        if (unit?.code.includes('kia')) {
          filtered = allServices.filter(
            (s) =>
              s.medicalFlow === 'pregnancy' ||
              s.medicalFlow === 'immunization' ||
              s.codePrefix === 'KIA' ||
              s.codePrefix === 'IM',
          );
        } else if (unit?.code.includes('umum')) {
          filtered = allServices.filter(
            (s) =>
              !s.medicalFlow ||
              (s.medicalFlow as string) === 'general' ||
              s.codePrefix === 'UM' ||
              s.codePrefix === 'KD',
          );
        }

        return filtered.map((r) => ({
          id: r.id,
          poliklinikId,
          namaLayanan: r.name,
          deskripsi: r.description || null,
          medicalFlow: (r.medicalFlow as any) || 'general',
          isActive: r.isActive,
          createdAt: new Date(r.createdAt),
        }));
      },
      600,
    );
  }

  async findLayananById(id: string): Promise<LayananPoliEntity | null> {
    const record = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.id, id),
    });
    if (!record) return null;
    return {
      id: record.id,
      poliklinikId: '',
      namaLayanan: record.name,
      deskripsi: record.description || null,
      medicalFlow: (record.medicalFlow as any) || 'general',
      isActive: record.isActive,
      createdAt: new Date(record.createdAt),
    };
  }

  async updateLayanan(
    id: string,
    data: Partial<LayananPoliEntity>,
  ): Promise<LayananPoliEntity | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.namaLayanan !== undefined) updateValues.name = data.namaLayanan;
    if (data.deskripsi !== undefined) updateValues.description = data.deskripsi;
    if (data.medicalFlow !== undefined)
      updateValues.medicalFlow =
        data.medicalFlow === 'pregnancy' || data.medicalFlow === 'immunization'
          ? data.medicalFlow
          : null;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;

    const [updated] = await this.db
      .update(clinicServices)
      .set(updateValues)
      .where(eq(clinicServices.id, id))
      .returning();

    if (data.poliklinikId) {
      await this.redis.del(`clinics:layanan:poli:${data.poliklinikId}`);
    }

    return updated
      ? {
          id: updated.id,
          poliklinikId: data.poliklinikId || '',
          namaLayanan: updated.name,
          deskripsi: updated.description || null,
          medicalFlow: (updated.medicalFlow as any) || 'general',
          isActive: updated.isActive,
          createdAt: new Date(updated.createdAt),
        }
      : null;
  }

  async deleteLayanan(id: string): Promise<boolean> {
    await this.db
      .update(clinicServices)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(clinicServices.id, id));

    return true;
  }
}

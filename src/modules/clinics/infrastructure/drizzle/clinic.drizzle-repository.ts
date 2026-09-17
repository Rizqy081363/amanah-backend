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
}

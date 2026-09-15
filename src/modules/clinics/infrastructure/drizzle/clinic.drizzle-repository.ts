import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ClinicRepository } from '../../domain/repositories/clinic.repository';
import {
  PoliklinikEntity,
  LayananPoliEntity,
} from '../../domain/entities/clinic.entity';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { poliklinik, layananPoli } from '../../../../database/schema';
import { RedisService } from '../../../../common/redis/redis.service';

@Injectable()
export class ClinicDrizzleRepository implements ClinicRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redis: RedisService,
  ) {}

  async findAllPoliklinik(): Promise<PoliklinikEntity[]> {
    return this.redis.getOrSet(
      'clinics:poliklinik:all',
      async () => {
        const records = await this.db.query.poliklinik.findMany({
          where: eq(poliklinik.isActive, true),
        });
        return records.map((r) => ({
          id: r.id,
          namaPoli: r.namaPoli,
          kodePoli: r.kodePoli,
          deskripsi: r.deskripsi,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      },
      600, // 10 minutes cache
    );
  }

  async findPoliklinikByKode(kode: string): Promise<PoliklinikEntity | null> {
    const record = await this.db.query.poliklinik.findFirst({
      where: eq(poliklinik.kodePoli, kode),
    });
    if (!record) return null;
    return {
      id: record.id,
      namaPoli: record.namaPoli,
      kodePoli: record.kodePoli,
      deskripsi: record.deskripsi,
      isActive: record.isActive,
      createdAt: record.createdAt,
    };
  }

  async findLayananByPoliId(poliklinikId: string): Promise<LayananPoliEntity[]> {
    return this.redis.getOrSet(
      `clinics:layanan:poli:${poliklinikId}`,
      async () => {
        const records = await this.db.query.layananPoli.findMany({
          where: eq(layananPoli.poliklinikId, poliklinikId),
        });
        return records.map((r) => ({
          id: r.id,
          poliklinikId: r.poliklinikId,
          namaLayanan: r.namaLayanan,
          deskripsi: r.deskripsi,
          medicalFlow: r.medicalFlow,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      },
      600,
    );
  }

  async findLayananById(id: string): Promise<LayananPoliEntity | null> {
    const record = await this.db.query.layananPoli.findFirst({
      where: eq(layananPoli.id, id),
    });
    if (!record) return null;
    return {
      id: record.id,
      poliklinikId: record.poliklinikId,
      namaLayanan: record.namaLayanan,
      deskripsi: record.deskripsi,
      medicalFlow: record.medicalFlow,
      isActive: record.isActive,
      createdAt: record.createdAt,
    };
  }
}

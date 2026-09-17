import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  LayananPoliEntity,
  PoliklinikEntity,
} from '../domain/entities/clinic.entity';
import {
  CLINIC_REPOSITORY,
  ClinicRepository,
} from '../domain/repositories/clinic.repository';
import { CreateClinicDto } from '../presentation/dto/create-clinic.dto';
import { CreateLayananDto } from '../presentation/dto/create-layanan.dto';
import { UpdateClinicDto } from '../presentation/dto/update-clinic.dto';
import { UpdateLayananDto } from '../presentation/dto/update-layanan.dto';

const CLINIC_CACHE_TTL_SECONDS = 300; // 5 minutes catalog cache
const CLINIC_CACHE_PREFIX = 'clinics';

@Injectable()
export class ClinicsService {
  private readonly logger = new Logger(ClinicsService.name);

  constructor(
    @Inject(CLINIC_REPOSITORY)
    private readonly clinicRepo: ClinicRepository,
    private readonly redisService: RedisService,
  ) {}

  async findAllPoliklinik(): Promise<PoliklinikEntity[]> {
    const cacheKey = `${CLINIC_CACHE_PREFIX}:poliklinik:all`;
    return this.redisService.getOrSet(
      cacheKey,
      () => this.clinicRepo.findAllPoliklinik(),
      CLIC_CACHE_TTL_SECONDS,
    );
  }

  async findPoliklinikById(id: string): Promise<PoliklinikEntity> {
    const cacheKey = `${CLINIC_CACHE_PREFIX}:poliklinik:${id}`;
    const clinic = await this.redisService.getOrSet(
      cacheKey,
      () => this.clinicRepo.findPoliklinikById(id),
      CLIC_CACHE_TTL_SECONDS,
    );

    if (!clinic) {
      throw new NotFoundException(`Poliklinik dengan ID ${id} tidak ditemukan`);
    }

    return clinic;
  }

  async createPoliklinik(dto: CreateClinicDto): Promise<PoliklinikEntity> {
    const created = await this.clinicRepo.createPoliklinik(dto);
    await this.invalidateClinicsCache();
    return created;
  }

  async updatePoliklinik(
    id: string,
    dto: UpdateClinicDto,
  ): Promise<PoliklinikEntity> {
    const updated = await this.clinicRepo.updatePoliklinik(id, dto);
    if (!updated) {
      throw new NotFoundException(`Poliklinik dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateClinicsCache();
    return updated;
  }

  async deletePoliklinik(id: string): Promise<void> {
    const success = await this.clinicRepo.deletePoliklinik(id);
    if (!success) {
      throw new NotFoundException(`Poliklinik dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateClinicsCache();
  }

  async findLayananByPoliId(
    poliklinikId: string,
  ): Promise<LayananPoliEntity[]> {
    const cacheKey = `${CLINIC_CACHE_PREFIX}:layanan:${poliklinikId}`;
    return this.redisService.getOrSet(
      cacheKey,
      () => this.clinicRepo.findLayananByPoliId(poliklinikId),
      CLIC_CACHE_TTL_SECONDS,
    );
  }

  async findLayananById(id: string): Promise<LayananPoliEntity> {
    const layanan = await this.clinicRepo.findLayananById(id);
    if (!layanan) {
      throw new NotFoundException(`Layanan dengan ID ${id} tidak ditemukan`);
    }
    return layanan;
  }

  async createLayanan(
    poliklinikId: string,
    dto: CreateLayananDto,
  ): Promise<LayananPoliEntity> {
    const created = await this.clinicRepo.createLayanan(poliklinikId, dto);
    await this.invalidateClinicsCache();
    return created;
  }

  async updateLayanan(
    id: string,
    dto: UpdateLayananDto,
  ): Promise<LayananPoliEntity> {
    const updated = await this.clinicRepo.updateLayanan(id, dto);
    if (!updated) {
      throw new NotFoundException(`Layanan dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateClinicsCache();
    return updated;
  }

  async deleteLayanan(id: string): Promise<void> {
    const success = await this.clinicRepo.deleteLayanan(id);
    if (!success) {
      throw new NotFoundException(`Layanan dengan ID ${id} tidak ditemukan`);
    }
    await this.invalidateClinicsCache();
  }

  private async invalidateClinicsCache(): Promise<void> {
    try {
      await this.redisService.deleteByPrefix(CLINIC_CACHE_PREFIX);
    } catch (err) {
      this.logger.warn(`Failed to invalidate clinic cache: ${String(err)}`);
    }
  }
}
const CLIC_CACHE_TTL_SECONDS = CLINIC_CACHE_TTL_SECONDS;

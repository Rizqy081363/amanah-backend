import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  LayananPoliEntity,
  PoliklinikEntity,
} from '../domain/entities/clinic.entity';
import {
  CLINIC_REPOSITORY,
  ClinicRepository,
} from '../domain/repositories/clinic.repository';
import { ServiceCatalogResponseDto } from '../presentation/dto/service-catalog.dto';

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

  async getCatalog(): Promise<ServiceCatalogResponseDto> {
    const categories = await this.clinicRepo.getCatalog();
    return {
      success: true,
      categories,
    };
  }

  async invalidateClinicsCache(): Promise<void> {
    try {
      await Promise.all([
        this.redisService.deleteByPrefix(CLINIC_CACHE_PREFIX),
        this.redisService.deleteByPrefix('clinics:analytics'),
        this.redisService.invalidateTags('clinics', 'analytics'),
      ]);
    } catch (err) {
      this.logger.warn(`Failed to invalidate clinic cache: ${String(err)}`);
    }
  }
}
const CLIC_CACHE_TTL_SECONDS = CLINIC_CACHE_TTL_SECONDS;

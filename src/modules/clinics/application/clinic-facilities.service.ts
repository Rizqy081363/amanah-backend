import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, max, ne } from 'drizzle-orm';
import { CanonicalSlugHelper } from '@common/utils';
import { RedisService } from '../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { clinicFacilities } from '../../../database/schema';
import {
  ClinicFacilityResponseDto,
  CreateClinicFacilityDto,
  UpdateClinicFacilityDto,
} from '../presentation/dto/clinic-facility.dto';

const FACILITIES_CACHE_TTL_SECONDS = 300;
const FACILITIES_CACHE_PREFIX = 'clinics:facilities';

@Injectable()
export class ClinicFacilitiesService {
  private readonly logger = new Logger(ClinicFacilitiesService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redis: RedisService,
  ) {}

  async getPublishedFacilities(): Promise<ClinicFacilityResponseDto[]> {
    const cacheKey = `${FACILITIES_CACHE_PREFIX}:published`;
    return this.redis.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.db.query.clinicFacilities.findMany({
          where: eq(clinicFacilities.isPublished, true),
          orderBy: [asc(clinicFacilities.displayOrder)],
          with: {
            service: true,
          },
        });

        return rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          summary: r.summary ?? null,
          imageUrl: r.imageUrl ?? null,
          ctaUrl: r.ctaUrl,
          displayOrder: r.displayOrder,
          isPublished: r.isPublished,
          serviceId: r.serviceId ?? null,
          serviceName: r.service?.name ?? null,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        }));
      },
      FACILITIES_CACHE_TTL_SECONDS,
    );
  }

  async getAllFacilitiesForAdmin(): Promise<ClinicFacilityResponseDto[]> {
    const rows = await this.db.query.clinicFacilities.findMany({
      orderBy: [asc(clinicFacilities.displayOrder)],
      with: {
        service: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary ?? null,
      imageUrl: r.imageUrl ?? null,
      ctaUrl: r.ctaUrl,
      displayOrder: r.displayOrder,
      isPublished: r.isPublished,
      serviceId: r.serviceId ?? null,
      serviceName: r.service?.name ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
  }

  async createFacility(
    dto: CreateClinicFacilityDto,
  ): Promise<ClinicFacilityResponseDto> {
    const resolvedSlug = dto.slug?.trim()
      ? CanonicalSlugHelper.toSlug(dto.slug)
      : CanonicalSlugHelper.toSlug(dto.title);

    const existingSlug = await this.db.query.clinicFacilities.findFirst({
      where: eq(clinicFacilities.slug, resolvedSlug),
    });

    if (existingSlug) {
      throw new ConflictException(
        `Fasilitas dengan slug '${resolvedSlug}' sudah digunakan`,
      );
    }

    let resolvedOrder = dto.displayOrder;
    if (resolvedOrder === undefined || resolvedOrder === null || resolvedOrder <= 0) {
      const maxOrderRow = await this.db
        .select({ maxOrder: max(clinicFacilities.displayOrder) })
        .from(clinicFacilities);
      resolvedOrder = (maxOrderRow[0]?.maxOrder ?? 0) + 1;
    }

    const [created] = await this.db
      .insert(clinicFacilities)
      .values({
        title: dto.title.trim(),
        slug: resolvedSlug,
        summary: dto.summary?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        ctaUrl: dto.ctaUrl?.trim() || '/kontak',
        serviceId: dto.serviceId || null,
        displayOrder: resolvedOrder,
        isPublished: dto.isPublished ?? true,
      })
      .returning();

    await this.invalidateFacilitiesCache();

    return {
      id: created.id,
      slug: created.slug,
      title: created.title,
      summary: created.summary ?? null,
      imageUrl: created.imageUrl ?? null,
      ctaUrl: created.ctaUrl,
      displayOrder: created.displayOrder,
      isPublished: created.isPublished,
      serviceId: created.serviceId ?? null,
      createdAt: new Date(created.createdAt).toISOString(),
      updatedAt: new Date(created.updatedAt).toISOString(),
    };
  }

  async updateFacility(
    id: string,
    dto: UpdateClinicFacilityDto,
  ): Promise<ClinicFacilityResponseDto> {
    const existing = await this.db.query.clinicFacilities.findFirst({
      where: eq(clinicFacilities.id, id),
    });

    if (!existing) {
      throw new NotFoundException(`Fasilitas dengan ID '${id}' tidak ditemukan`);
    }

    let resolvedSlug = existing.slug;
    if (dto.slug && dto.slug.trim() !== existing.slug) {
      resolvedSlug = CanonicalSlugHelper.toSlug(dto.slug);
      const duplicateSlug = await this.db.query.clinicFacilities.findFirst({
        where: and(
          eq(clinicFacilities.slug, resolvedSlug),
          ne(clinicFacilities.id, id),
        ),
      });
      if (duplicateSlug) {
        throw new ConflictException(
          `Fasilitas dengan slug '${resolvedSlug}' sudah digunakan`,
        );
      }
    }

    const [updated] = await this.db
      .update(clinicFacilities)
      .set({
        title: dto.title !== undefined ? dto.title.trim() : existing.title,
        slug: resolvedSlug,
        summary:
          dto.summary !== undefined ? dto.summary?.trim() || null : existing.summary,
        imageUrl:
          dto.imageUrl !== undefined ? dto.imageUrl?.trim() || null : existing.imageUrl,
        ctaUrl:
          dto.ctaUrl !== undefined ? dto.ctaUrl?.trim() || '/kontak' : existing.ctaUrl,
        serviceId:
          dto.serviceId !== undefined ? dto.serviceId || null : existing.serviceId,
        displayOrder:
          dto.displayOrder !== undefined ? dto.displayOrder : existing.displayOrder,
        isPublished:
          dto.isPublished !== undefined ? dto.isPublished : existing.isPublished,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(clinicFacilities.id, id))
      .returning();

    await this.invalidateFacilitiesCache();

    return {
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      summary: updated.summary ?? null,
      imageUrl: updated.imageUrl ?? null,
      ctaUrl: updated.ctaUrl,
      displayOrder: updated.displayOrder,
      isPublished: updated.isPublished,
      serviceId: updated.serviceId ?? null,
      createdAt: new Date(updated.createdAt).toISOString(),
      updatedAt: new Date(updated.updatedAt).toISOString(),
    };
  }

  async deleteFacility(id: string): Promise<{ deleted: boolean }> {
    const existing = await this.db.query.clinicFacilities.findFirst({
      where: eq(clinicFacilities.id, id),
    });

    if (!existing) {
      throw new NotFoundException(`Fasilitas dengan ID '${id}' tidak ditemukan`);
    }

    await this.db.delete(clinicFacilities).where(eq(clinicFacilities.id, id));
    await this.invalidateFacilitiesCache();

    return { deleted: true };
  }

  async invalidateFacilitiesCache(): Promise<void> {
    try {
      await this.redis.deleteByPrefix(FACILITIES_CACHE_PREFIX);
    } catch (err) {
      this.logger.warn(`Failed to invalidate facilities cache: ${String(err)}`);
    }
  }
}

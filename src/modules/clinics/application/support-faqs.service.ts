import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq, max } from 'drizzle-orm';
import { RedisService } from '../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { supportFaqs } from '../../../database/schema';
import {
  CreateSupportFaqDto,
  SupportFaqResponseDto,
  UpdateSupportFaqDto,
} from '../presentation/dto/support-faq.dto';

const FAQS_CACHE_TTL_SECONDS = 300;
const FAQS_CACHE_PREFIX = 'clinics:faqs';

@Injectable()
export class SupportFaqsService {
  private readonly logger = new Logger(SupportFaqsService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redis: RedisService,
  ) {}

  async getPublishedFaqs(path?: string): Promise<SupportFaqResponseDto[]> {
    const cacheKey = `${FAQS_CACHE_PREFIX}:${path || 'all'}`;
    return this.redis.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.db.query.supportFaqs.findMany({
          where: eq(supportFaqs.isPublished, true),
          orderBy: [asc(supportFaqs.displayOrder)],
          with: {
            service: true,
            serviceCategory: true,
          },
        });

        const filtered = path
          ? rows.filter(
              (r) =>
                !r.paths ||
                r.paths.length === 0 ||
                r.paths.includes(path) ||
                r.paths.includes('/'),
            )
          : rows;

        return filtered.map((r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          solutionSteps: r.solutionSteps,
          paths: r.paths,
          displayOrder: r.displayOrder,
          isPublished: r.isPublished,
          serviceId: r.serviceId ?? null,
          serviceName: r.service?.name ?? null,
          categoryId: r.categoryId ?? null,
          categoryName: r.serviceCategory?.name ?? null,
          createdAt: new Date(r.createdAt).toISOString(),
          updatedAt: new Date(r.updatedAt).toISOString(),
        }));
      },
      FAQS_CACHE_TTL_SECONDS,
    );
  }

  async getAllFaqsForAdmin(): Promise<SupportFaqResponseDto[]> {
    const rows = await this.db.query.supportFaqs.findMany({
      orderBy: [asc(supportFaqs.displayOrder)],
      with: {
        service: true,
        serviceCategory: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      solutionSteps: r.solutionSteps,
      paths: r.paths,
      displayOrder: r.displayOrder,
      isPublished: r.isPublished,
      serviceId: r.serviceId ?? null,
      serviceName: r.service?.name ?? null,
      categoryId: r.categoryId ?? null,
      categoryName: r.serviceCategory?.name ?? null,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
  }

  async createFaq(dto: CreateSupportFaqDto): Promise<SupportFaqResponseDto> {
    let resolvedOrder = dto.displayOrder;
    if (resolvedOrder === undefined || resolvedOrder === null || resolvedOrder <= 0) {
      const maxOrderRow = await this.db
        .select({ maxOrder: max(supportFaqs.displayOrder) })
        .from(supportFaqs);
      resolvedOrder = (maxOrderRow[0]?.maxOrder ?? 0) + 1;
    }

    const [created] = await this.db
      .insert(supportFaqs)
      .values({
        category: dto.category.trim(),
        title: dto.title.trim(),
        solutionSteps: dto.solutionSteps.map((s) => s.trim()).filter(Boolean),
        paths: dto.paths && dto.paths.length > 0 ? dto.paths : ['/'],
        serviceId: dto.serviceId || null,
        categoryId: dto.categoryId || null,
        displayOrder: resolvedOrder,
        isPublished: dto.isPublished ?? true,
      })
      .returning();

    await this.invalidateFaqsCache();

    return {
      id: created.id,
      category: created.category,
      title: created.title,
      solutionSteps: created.solutionSteps,
      paths: created.paths,
      displayOrder: created.displayOrder,
      isPublished: created.isPublished,
      serviceId: created.serviceId ?? null,
      categoryId: created.categoryId ?? null,
      createdAt: new Date(created.createdAt).toISOString(),
      updatedAt: new Date(created.updatedAt).toISOString(),
    };
  }

  async updateFaq(
    id: string,
    dto: UpdateSupportFaqDto,
  ): Promise<SupportFaqResponseDto> {
    const existing = await this.db.query.supportFaqs.findFirst({
      where: eq(supportFaqs.id, id),
    });

    if (!existing) {
      throw new NotFoundException(`FAQ dengan ID '${id}' tidak ditemukan`);
    }

    const [updated] = await this.db
      .update(supportFaqs)
      .set({
        category:
          dto.category !== undefined ? dto.category.trim() : existing.category,
        title: dto.title !== undefined ? dto.title.trim() : existing.title,
        solutionSteps:
          dto.solutionSteps !== undefined
            ? dto.solutionSteps.map((s) => s.trim()).filter(Boolean)
            : existing.solutionSteps,
        paths: dto.paths !== undefined ? dto.paths : existing.paths,
        serviceId:
          dto.serviceId !== undefined ? dto.serviceId || null : existing.serviceId,
        categoryId:
          dto.categoryId !== undefined
            ? dto.categoryId || null
            : existing.categoryId,
        displayOrder:
          dto.displayOrder !== undefined ? dto.displayOrder : existing.displayOrder,
        isPublished:
          dto.isPublished !== undefined ? dto.isPublished : existing.isPublished,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(supportFaqs.id, id))
      .returning();

    await this.invalidateFaqsCache();

    return {
      id: updated.id,
      category: updated.category,
      title: updated.title,
      solutionSteps: updated.solutionSteps,
      paths: updated.paths,
      displayOrder: updated.displayOrder,
      isPublished: updated.isPublished,
      serviceId: updated.serviceId ?? null,
      categoryId: updated.categoryId ?? null,
      createdAt: new Date(updated.createdAt).toISOString(),
      updatedAt: new Date(updated.updatedAt).toISOString(),
    };
  }

  async deleteFaq(id: string): Promise<{ deleted: boolean }> {
    const existing = await this.db.query.supportFaqs.findFirst({
      where: eq(supportFaqs.id, id),
    });

    if (!existing) {
      throw new NotFoundException(`FAQ dengan ID '${id}' tidak ditemukan`);
    }

    await this.db.delete(supportFaqs).where(eq(supportFaqs.id, id));
    await this.invalidateFaqsCache();

    return { deleted: true };
  }

  async invalidateFaqsCache(): Promise<void> {
    try {
      await this.redis.deleteByPrefix(FAQS_CACHE_PREFIX);
    } catch (err) {
      this.logger.warn(`Failed to invalidate FAQs cache: ${String(err)}`);
    }
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { clinicServices } from '../../../../database/schema/amanah.schema';
import { promotions } from '../../../../database/schema/promotions.schema';
import { PromotionEntity } from '../../domain/entities/promotion.entity';
import {
  CreatePromotionData,
  PromotionRepository,
  UpdatePromotionData,
} from '../../domain/repositories/promotion.repository.interface';
import { QueryAdminPromotionsFilter } from '../../domain/types/promotion.types';

@Injectable()
export class PromotionDrizzleRepository implements PromotionRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(row: {
    promotions: typeof promotions.$inferSelect;
    clinic_services?: typeof clinicServices.$inferSelect | null;
  }): PromotionEntity {
    const p = row.promotions;
    const s = row.clinic_services;

    return new PromotionEntity({
      id: p.id,
      serviceId: p.serviceId,
      serviceName: s?.name || null,
      serviceCode: s?.code || null,
      title: p.title,
      summary: p.summary,
      body: p.body,
      terms: p.terms,
      imageType: p.imageType,
      imageValue: p.imageValue,
      imageAlt: p.imageAlt,
      ctaLabel: p.ctaLabel,
      ctaUrl: p.ctaUrl,
      showBanner: p.showBanner,
      showModal: p.showModal,
      showSection: p.showSection,
      modalFrequency: p.modalFrequency,
      modalDelaySec: p.modalDelaySec,
      modalMode: (p.modalMode as any) || 'card',
      priority: p.priority,
      isPublished: p.isPublished,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      deletedAt: p.deletedAt,
      broadcastToUsers: p.broadcastToUsers,
      broadcastAt: p.broadcastAt,
      broadcastChannels: p.broadcastChannels,
      createdBy: p.createdBy,
      updatedBy: p.updatedBy,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }

  async findLivePublic(now = new Date()): Promise<PromotionEntity[]> {
    const nowIso = now.toISOString();

    const rows = await this.db
      .select({
        promotions,
        clinic_services: clinicServices,
      })
      .from(promotions)
      .leftJoin(clinicServices, eq(promotions.serviceId, clinicServices.id))
      .where(
        and(
          isNull(promotions.deletedAt),
          eq(promotions.isPublished, true),
          or(isNull(promotions.startsAt), sql`${promotions.startsAt} <= ${nowIso}`),
          or(isNull(promotions.endsAt), sql`${promotions.endsAt} > ${nowIso}`),
        ),
      )
      .orderBy(desc(promotions.priority), sql`${promotions.startsAt} DESC NULLS LAST`)
      .limit(20);

    return rows.map((r) => this.mapRecordToEntity(r));
  }

  async findAllAdmin(
    filter: QueryAdminPromotionsFilter,
  ): Promise<{ items: PromotionEntity[]; total: number }> {
    const nowIso = new Date().toISOString();
    const conditions = [];

    // Search by title or summary
    if (filter.search && filter.search.trim()) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(
        or(ilike(promotions.title, term), ilike(promotions.summary, term)),
      );
    }

    // Filter by Service ID
    if (filter.serviceId) {
      conditions.push(eq(promotions.serviceId, filter.serviceId));
    }

    // Filter by Status
    if (filter.status && filter.status !== 'all') {
      switch (filter.status) {
        case 'archived':
          conditions.push(isNotNull(promotions.deletedAt));
          break;
        case 'draft':
          conditions.push(
            and(isNull(promotions.deletedAt), eq(promotions.isPublished, false)),
          );
          break;
        case 'scheduled':
          conditions.push(
            and(
              isNull(promotions.deletedAt),
              eq(promotions.isPublished, true),
              sql`${promotions.startsAt} > ${nowIso}`,
            ),
          );
          break;
        case 'expired':
          conditions.push(
            and(
              isNull(promotions.deletedAt),
              eq(promotions.isPublished, true),
              sql`${promotions.endsAt} <= ${nowIso}`,
            ),
          );
          break;
        case 'live':
          conditions.push(
            and(
              isNull(promotions.deletedAt),
              eq(promotions.isPublished, true),
              or(isNull(promotions.startsAt), sql`${promotions.startsAt} <= ${nowIso}`),
              or(isNull(promotions.endsAt), sql`${promotions.endsAt} > ${nowIso}`),
            ),
          );
          break;
      }
    } else {
      // By default, exclude archived unless explicitly requested
      conditions.push(isNull(promotions.deletedAt));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(promotions)
      .where(whereClause);
    const total = Number(countResult[0]?.count || 0);

    // Items
    const limit = filter.limit && filter.limit > 0 ? filter.limit : 50;
    const offset = filter.offset && filter.offset >= 0 ? filter.offset : 0;

    const rows = await this.db
      .select({
        promotions,
        clinic_services: clinicServices,
      })
      .from(promotions)
      .leftJoin(clinicServices, eq(promotions.serviceId, clinicServices.id))
      .where(whereClause)
      .orderBy(desc(promotions.priority), desc(promotions.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map((r) => this.mapRecordToEntity(r)),
      total,
    };
  }

  async findPendingBroadcastPromotions(now = new Date()): Promise<PromotionEntity[]> {
    const nowIso = now.toISOString();

    const rows = await this.db
      .select({
        promotions,
        clinic_services: clinicServices,
      })
      .from(promotions)
      .leftJoin(clinicServices, eq(promotions.serviceId, clinicServices.id))
      .where(
        and(
          isNull(promotions.deletedAt),
          eq(promotions.isPublished, true),
          eq(promotions.broadcastToUsers, true),
          isNull(promotions.broadcastAt),
          or(isNull(promotions.startsAt), sql`${promotions.startsAt} <= ${nowIso}`),
          or(isNull(promotions.endsAt), sql`${promotions.endsAt} > ${nowIso}`),
        ),
      )
      .orderBy(desc(promotions.priority));

    return rows.map((r) => this.mapRecordToEntity(r));
  }

  async findById(id: string): Promise<PromotionEntity | null> {
    const rows = await this.db
      .select({
        promotions,
        clinic_services: clinicServices,
      })
      .from(promotions)
      .leftJoin(clinicServices, eq(promotions.serviceId, clinicServices.id))
      .where(eq(promotions.id, id))
      .limit(1);

    if (!rows[0]) return null;
    return this.mapRecordToEntity(rows[0]);
  }

  async create(data: CreatePromotionData): Promise<PromotionEntity> {
    const inserted = await this.db
      .insert(promotions)
      .values({
        serviceId: data.serviceId || null,
        title: data.title,
        summary: data.summary,
        body: data.body || null,
        terms: data.terms || null,
        imageType: data.imageType,
        imageValue: data.imageValue,
        imageAlt: data.imageAlt,
        ctaLabel: data.ctaLabel || null,
        ctaUrl: data.ctaUrl || null,
        showBanner: data.showBanner,
        showModal: data.showModal,
        showSection: data.showSection,
        modalFrequency: data.modalFrequency,
        modalDelaySec: data.modalDelaySec,
        modalMode: data.modalMode || 'card',
        priority: data.priority,
        isPublished: data.isPublished,
        startsAt: data.startsAt || null,
        endsAt: data.endsAt || null,
        broadcastToUsers: data.broadcastToUsers || false,
        broadcastChannels: data.broadcastChannels || ['in_app', 'push'],
        createdBy: data.createdBy || null,
        updatedBy: data.createdBy || null,
      })
      .returning();

    const created = await this.findById(inserted[0].id);
    if (!created) {
      throw new Error(`Failed to load newly created promotion ${inserted[0].id}`);
    }
    return created;
  }

  async update(id: string, data: UpdatePromotionData): Promise<PromotionEntity> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.serviceId !== undefined) updateValues.serviceId = data.serviceId || null;
    if (data.title !== undefined) updateValues.title = data.title;
    if (data.summary !== undefined) updateValues.summary = data.summary;
    if (data.body !== undefined) updateValues.body = data.body || null;
    if (data.terms !== undefined) updateValues.terms = data.terms || null;
    if (data.imageType !== undefined) updateValues.imageType = data.imageType;
    if (data.imageValue !== undefined) updateValues.imageValue = data.imageValue;
    if (data.imageAlt !== undefined) updateValues.imageAlt = data.imageAlt;
    if (data.ctaLabel !== undefined) updateValues.ctaLabel = data.ctaLabel || null;
    if (data.ctaUrl !== undefined) updateValues.ctaUrl = data.ctaUrl || null;
    if (data.showBanner !== undefined) updateValues.showBanner = data.showBanner;
    if (data.showModal !== undefined) updateValues.showModal = data.showModal;
    if (data.showSection !== undefined) updateValues.showSection = data.showSection;
    if (data.modalFrequency !== undefined) updateValues.modalFrequency = data.modalFrequency;
    if (data.modalDelaySec !== undefined) updateValues.modalDelaySec = data.modalDelaySec;
    if (data.modalMode !== undefined) updateValues.modalMode = data.modalMode;
    if (data.priority !== undefined) updateValues.priority = data.priority;
    if (data.isPublished !== undefined) updateValues.isPublished = data.isPublished;
    if (data.startsAt !== undefined) updateValues.startsAt = data.startsAt || null;
    if (data.endsAt !== undefined) updateValues.endsAt = data.endsAt || null;
    if (data.broadcastToUsers !== undefined) updateValues.broadcastToUsers = data.broadcastToUsers;
    if (data.broadcastChannels !== undefined) updateValues.broadcastChannels = data.broadcastChannels;
    if (data.updatedBy !== undefined) updateValues.updatedBy = data.updatedBy;

    await this.db
      .update(promotions)
      .set(updateValues)
      .where(eq(promotions.id, id));

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Promotion ${id} not found after update`);
    }
    return updated;
  }

  async markBroadcastDispatched(id: string, dispatchedAt = new Date()): Promise<boolean> {
    const res = await this.db
      .update(promotions)
      .set({
        broadcastAt: dispatchedAt.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(promotions.id, id), isNull(promotions.broadcastAt)));

    return true;
  }

  async softDelete(id: string, userId?: string): Promise<boolean> {
    await this.db
      .update(promotions)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: userId || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(promotions.id, id));

    return true;
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PromotionEntity } from '../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  PromotionRepository,
} from '../domain/repositories/promotion.repository.interface';
import {
  PublicPromotion,
  QueryAdminPromotionsFilter,
} from '../domain/types/promotion.types';
import { PromotionsBroadcastService } from './services/promotions-broadcast.service';

const STATIC_PATH_REGEX = /^\/promo\/[a-z0-9._-]+\.(webp|jpe?g|png|avif)$/i;
const DEFAULT_ALLOWED_HOSTS = [
  'drive.google.com',
  'lh3.googleusercontent.com',
  'cdn.discordapp.com',
  'media.discordapp.net',
];

function normalizeImageUrl(input: string): string {
  const trimmed = input.trim();
  const driveFileMatch = trimmed.match(
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (driveFileMatch) {
    return `https://drive.google.com/thumbnail?id=${driveFileMatch[1]}&sz=w1600`;
  }

  const driveIdMatch = trimmed.match(
    /drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([a-zA-Z0-9_-]+)/,
  );
  if (driveIdMatch) {
    return `https://drive.google.com/thumbnail?id=${driveIdMatch[1]}&sz=w1600`;
  }

  return trimmed;
}

function isSafeHref(href?: string | null): boolean {
  if (!href) return true;
  const trimmed = href.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('https://')) return true;
  if (trimmed.startsWith('tel:')) return true;
  return false;
}

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promoRepo: PromotionRepository,
    private readonly broadcastService: PromotionsBroadcastService,
  ) {}

  async getLivePublicPromotions(): Promise<{ data: PublicPromotion[] }> {
    const liveEntities = await this.promoRepo.findLivePublic();
    const data = liveEntities.map((p) => p.toPublicDto());
    return { data };
  }

  async getPublicPromotionById(id: string): Promise<{ data: PublicPromotion }> {
    const entity = await this.promoRepo.findById(id);
    if (!entity || entity.deletedAt || entity.computeStatus() !== 'live') {
      throw new NotFoundException(`Promotion with ID "${id}" was not found or is no longer active.`);
    }
    return { data: entity.toPublicDto() };
  }

  async getAdminPromotions(filter: QueryAdminPromotionsFilter) {
    const { items, total } = await this.promoRepo.findAllAdmin(filter);
    const data = items.map((p) => ({
      ...p,
      status: p.computeStatus(),
      placements: p.getPlacements(),
    }));
    return { data, total };
  }

  async getPromotionById(id: string) {
    const entity = await this.promoRepo.findById(id);
    if (!entity) {
      throw new NotFoundException(`Promotion with ID "${id}" was not found.`);
    }
    return {
      ...entity,
      status: entity.computeStatus(),
      placements: entity.getPlacements(),
    };
  }

  private validatePayload(dto: {
    imageType: 'static' | 'url';
    imageValue: string;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    showBanner?: boolean;
    showModal?: boolean;
    showSection?: boolean;
  }): string {
    // 1. Image validation
    if (dto.imageType === 'static') {
      if (!STATIC_PATH_REGEX.test(dto.imageValue.trim())) {
        throw new BadRequestException(
          'image_value untuk static harus mengikuti format: /promo/[nama-file].[webp|jpg|png|avif]',
        );
      }
      return dto.imageValue.trim();
    }

    // URL validation
    const normalized = normalizeImageUrl(dto.imageValue);
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== 'https:') {
        throw new BadRequestException('image_value URL wajib menggunakan protokol https:');
      }
      // Check allowlist
      const envHosts = process.env.PROMO_IMAGE_HOSTS
        ? process.env.PROMO_IMAGE_HOSTS.split(',').map((h) => h.trim().toLowerCase())
        : DEFAULT_ALLOWED_HOSTS;
      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = envHosts.some(
        (h) => hostname === h || hostname.endsWith(`.${h}`),
      );
      if (!isAllowed) {
        throw new BadRequestException(
          `Host "${hostname}" belum diizinkan dalam allowlist gambar promosi.`,
        );
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('image_value bukan URL yang valid.');
    }

    // 2. CTA validation
    if ((dto.ctaLabel && !dto.ctaUrl) || (!dto.ctaLabel && dto.ctaUrl)) {
      throw new BadRequestException(
        'cta_label dan cta_url harus diisi bersamaan atau dikosongkan keduanya.',
      );
    }
    if (dto.ctaUrl && !isSafeHref(dto.ctaUrl)) {
      throw new BadRequestException(
        'cta_url hanya mengizinkan protokol https:, tel:, atau relative path (/...)',
      );
    }

    // 3. Period validation
    if (dto.startsAt && dto.endsAt) {
      if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
        throw new BadRequestException('ends_at harus lebih besar dari starts_at');
      }
    }

    // 4. Placement validation
    const hasPlacement =
      Boolean(dto.showBanner) || Boolean(dto.showModal) || Boolean(dto.showSection);
    if (!hasPlacement) {
      throw new BadRequestException(
        'Setidaknya satu penempatan (banner, modal, atau section) wajib dipilih.',
      );
    }

    return normalized;
  }

  async createPromotion(dto: any, userId?: string) {
    const validatedImageValue = this.validatePayload(dto);

    const created = await this.promoRepo.create({
      serviceId: dto.serviceId || null,
      title: dto.title.trim(),
      summary: dto.summary.trim(),
      body: dto.body ? dto.body.trim() : null,
      terms: dto.terms ? dto.terms.trim() : null,
      imageType: dto.imageType,
      imageValue: validatedImageValue,
      imageAlt: dto.imageAlt.trim(),
      ctaLabel: dto.ctaLabel ? dto.ctaLabel.trim() : null,
      ctaUrl: dto.ctaUrl ? dto.ctaUrl.trim() : null,
      showBanner: dto.showBanner ?? true,
      showModal: dto.showModal ?? false,
      showSection: dto.showSection ?? true,
      modalFrequency: dto.modalFrequency ?? 'once_per_day',
      modalDelaySec: dto.modalDelaySec ?? 3,
      modalMode: dto.modalMode ?? 'card',
      priority: dto.priority ?? 0,
      isPublished: dto.isPublished ?? false,
      startsAt: dto.startsAt || null,
      endsAt: dto.endsAt || null,
      broadcastToUsers: dto.broadcastToUsers ?? false,
      broadcastChannels: dto.broadcastChannels ?? ['in_app', 'push'],
      createdBy: userId || null,
    });

    // If published and live immediately, dispatch broadcast
    if (
      created.isPublished &&
      created.broadcastToUsers &&
      created.computeStatus() === 'live'
    ) {
      this.broadcastService.broadcastPromotion(created).catch((err) => {
        this.logger.error(`Async broadcast error on create: ${String(err)}`);
      });
    }

    return {
      ...created,
      status: created.computeStatus(),
      placements: created.getPlacements(),
    };
  }

  async updatePromotion(id: string, dto: any, userId?: string) {
    const existing = await this.promoRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Promotion with ID "${id}" was not found.`);
    }

    let validatedImageValue = dto.imageValue;
    if (dto.imageType || dto.imageValue) {
      validatedImageValue = this.validatePayload({
        imageType: dto.imageType || existing.imageType,
        imageValue: dto.imageValue || existing.imageValue,
        ctaLabel: dto.ctaLabel !== undefined ? dto.ctaLabel : existing.ctaLabel,
        ctaUrl: dto.ctaUrl !== undefined ? dto.ctaUrl : existing.ctaUrl,
        startsAt: dto.startsAt !== undefined ? dto.startsAt : existing.startsAt,
        endsAt: dto.endsAt !== undefined ? dto.endsAt : existing.endsAt,
        showBanner:
          dto.showBanner !== undefined ? dto.showBanner : existing.showBanner,
        showModal:
          dto.showModal !== undefined ? dto.showModal : existing.showModal,
        showSection:
          dto.showSection !== undefined ? dto.showSection : existing.showSection,
      });
    }

    const updated = await this.promoRepo.update(id, {
      ...dto,
      imageValue: validatedImageValue,
      updatedBy: userId || null,
    });

    // Check if broadcast should trigger
    if (
      updated.isPublished &&
      updated.broadcastToUsers &&
      !updated.broadcastAt &&
      updated.computeStatus() === 'live'
    ) {
      this.broadcastService.broadcastPromotion(updated).catch((err) => {
        this.logger.error(`Async broadcast error on update: ${String(err)}`);
      });
    }

    return {
      ...updated,
      status: updated.computeStatus(),
      placements: updated.getPlacements(),
    };
  }

  async publishPromotion(id: string, userId?: string) {
    const existing = await this.promoRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Promotion with ID "${id}" was not found.`);
    }

    const updated = await this.promoRepo.update(id, {
      isPublished: true,
      updatedBy: userId || null,
    });

    if (
      updated.broadcastToUsers &&
      !updated.broadcastAt &&
      updated.computeStatus() === 'live'
    ) {
      this.broadcastService.broadcastPromotion(updated).catch((err) => {
        this.logger.error(`Async broadcast error on publish: ${String(err)}`);
      });
    }

    return {
      ...updated,
      status: updated.computeStatus(),
      placements: updated.getPlacements(),
    };
  }

  async unpublishPromotion(id: string, userId?: string) {
    const existing = await this.promoRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Promotion with ID "${id}" was not found.`);
    }

    const updated = await this.promoRepo.update(id, {
      isPublished: false,
      updatedBy: userId || null,
    });

    return {
      ...updated,
      status: updated.computeStatus(),
      placements: updated.getPlacements(),
    };
  }

  async duplicatePromotion(id: string, userId?: string) {
    const existing = await this.promoRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Promotion with ID "${id}" was not found.`);
    }

    const truncatedTitle = `Salinan ${existing.title}`.slice(0, 80);

    const duplicated = await this.promoRepo.create({
      serviceId: existing.serviceId,
      title: truncatedTitle,
      summary: existing.summary,
      body: existing.body,
      terms: existing.terms,
      imageType: existing.imageType,
      imageValue: existing.imageValue,
      imageAlt: existing.imageAlt,
      ctaLabel: existing.ctaLabel,
      ctaUrl: existing.ctaUrl,
      showBanner: existing.showBanner,
      showModal: existing.showModal,
      showSection: existing.showSection,
      modalFrequency: existing.modalFrequency,
      modalDelaySec: existing.modalDelaySec,
      priority: existing.priority,
      isPublished: false, // Duplicates always default to draft
      startsAt: null,
      endsAt: null,
      broadcastToUsers: false,
      broadcastChannels: existing.broadcastChannels,
      createdBy: userId || null,
    });

    return {
      ...duplicated,
      status: duplicated.computeStatus(),
      placements: duplicated.getPlacements(),
    };
  }

  async deletePromotion(id: string, userId?: string) {
    const existing = await this.promoRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Promotion with ID "${id}" was not found.`);
    }

    await this.promoRepo.softDelete(id, userId);
    return { success: true };
  }

  async triggerScheduledBroadcast(): Promise<number> {
    return this.broadcastService.processScheduledBroadcasts();
  }
}

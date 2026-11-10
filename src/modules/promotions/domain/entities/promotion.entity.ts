import {
  ModalFrequency,
  Placement,
  PromoImageType,
  PromoStatus,
  PublicPromotion,
} from '../types/promotion.types';

export class PromotionEntity {
  id: string;
  serviceId?: string | null;
  serviceName?: string | null;
  serviceCode?: string | null;
  title: string;
  summary: string;
  body?: string | null;
  terms?: string | null;
  imageType: PromoImageType;
  imageValue: string;
  imageAlt: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  showBanner: boolean;
  showModal: boolean;
  showSection: boolean;
  modalFrequency: ModalFrequency;
  modalDelaySec: number;
  priority: number;
  isPublished: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  deletedAt?: string | null;
  broadcastToUsers: boolean;
  broadcastAt?: string | null;
  broadcastChannels: string[];
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;

  constructor(props: Partial<PromotionEntity>) {
    Object.assign(this, props);
  }

  computeStatus(now = new Date()): PromoStatus {
    if (this.deletedAt) return 'archived';
    if (!this.isPublished) return 'draft';

    const nowIso = now.toISOString();
    if (this.startsAt && nowIso < this.startsAt) return 'scheduled';
    if (this.endsAt && nowIso >= this.endsAt) return 'expired';

    return 'live';
  }

  getPlacements(): Placement[] {
    const placements: Placement[] = [];
    if (this.showBanner) placements.push('banner');
    if (this.showModal) placements.push('modal');
    if (this.showSection) placements.push('section');
    return placements;
  }

  toPublicDto(): PublicPromotion {
    const placements = this.getPlacements();
    const version = Math.floor(
      new Date(this.updatedAt).getTime() / 1000,
    ).toString();

    const dto: PublicPromotion = {
      id: this.id,
      version,
      title: this.title,
      summary: this.summary,
      body: this.body || undefined,
      terms: this.terms || undefined,
      serviceId: this.serviceId || undefined,
      serviceName: this.serviceName || undefined,
      image: {
        src: this.imageValue,
        alt: this.imageAlt,
      },
      placements,
    };

    if (this.ctaLabel && this.ctaUrl) {
      dto.cta = {
        label: this.ctaLabel,
        href: this.ctaUrl,
      };
    }

    if (this.showModal) {
      dto.modal = {
        frequency: this.modalFrequency,
        delaySec: this.modalDelaySec,
      };
    }

    return dto;
  }
}

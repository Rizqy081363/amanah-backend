export type PromoImageType = 'static' | 'url';

export type ModalFrequency =
  | 'once_per_session'
  | 'once_per_day'
  | 'once_per_week';

export type ModalMode = 'card' | 'image_only';

export type PromoStatus =
  | 'draft'
  | 'scheduled'
  | 'live'
  | 'expired'
  | 'archived';

export type Placement = 'banner' | 'modal' | 'section';

export interface PromoImageSource {
  type: PromoImageType;
  value: string;
  alt: string;
}

export interface PromoCta {
  label: string;
  href: string;
}

export interface PublicPromotion {
  id: string;
  version: string; // epoch timestamp of updated_at to reset "already seen"
  title: string;
  summary: string;
  body?: string;
  terms?: string;
  serviceId?: string;
  serviceName?: string;
  targetPageId?: string;
  targetPage?: {
    id: string;
    name: string;
    routePath: string;
    customAlias?: string | null;
  };
  image: {
    src: string;
    alt: string;
  };
  cta?: {
    label: string;
    href: string;
  };
  placements: Placement[];
  modalMode?: ModalMode;
  modal?: {
    frequency: ModalFrequency;
    delaySec: number;
    mode: ModalMode;
  };
  startsAt?: string;
  endsAt?: string;
  createdAt?: string;
}

export interface QueryAdminPromotionsFilter {
  status?: PromoStatus | 'all';
  search?: string;
  serviceId?: string;
  limit?: number;
  offset?: number;
}

import { PromotionEntity } from '../entities/promotion.entity';
import {
  ModalFrequency,
  ModalMode,
  PromoImageType,
  QueryAdminPromotionsFilter,
} from '../types/promotion.types';

export const PROMOTION_REPOSITORY = 'PROMOTION_REPOSITORY';

export interface CreatePromotionData {
  serviceId?: string | null;
  targetPageId?: string | null;
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
  modalMode?: ModalMode;
  priority: number;
  isPublished: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  broadcastToUsers?: boolean;
  broadcastChannels?: string[];
  createdBy?: string | null;
}

export type UpdatePromotionData = Partial<CreatePromotionData> & {
  updatedBy?: string | null;
};

export interface PromotionRepository {
  findLivePublic(now?: Date): Promise<PromotionEntity[]>;
  findAllAdmin(
    filter: QueryAdminPromotionsFilter,
  ): Promise<{ items: PromotionEntity[]; total: number }>;
  findPendingBroadcastPromotions(now?: Date): Promise<PromotionEntity[]>;
  findById(id: string): Promise<PromotionEntity | null>;
  create(data: CreatePromotionData): Promise<PromotionEntity>;
  update(id: string, data: UpdatePromotionData): Promise<PromotionEntity>;
  markBroadcastDispatched(id: string, dispatchedAt?: Date): Promise<boolean>;
  softDelete(id: string, userId?: string): Promise<boolean>;
}

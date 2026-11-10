import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { patientProfiles } from '../../../../database/schema/amanah.schema';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { NotificationDispatchCommand } from '../../../notifications/contracts/notification-dispatch.contract';
import { PromotionEntity } from '../../domain/entities/promotion.entity';
import {
  PROMOTION_REPOSITORY,
  PromotionRepository,
} from '../../domain/repositories/promotion.repository.interface';

@Injectable()
export class PromotionsBroadcastService {
  private readonly logger = new Logger(PromotionsBroadcastService.name);

  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promoRepo: PromotionRepository,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly notificationGateway: NotificationGatewayService,
  ) {}

  async broadcastPromotion(promo: PromotionEntity): Promise<boolean> {
    try {
      if (promo.broadcastAt) {
        this.logger.debug(
          `Promo "${promo.title}" (${promo.id}) already broadcast at ${promo.broadcastAt}. Skipping.`,
        );
        return false;
      }

      this.logger.log(
        `Starting broadcast for promo "${promo.title}" (${promo.id}) to external patients...`,
      );

      // Resolve active registered external patients
      const activePatients = await this.db
        .select({ userId: patientProfiles.userId })
        .from(patientProfiles)
        .where(
          and(
            eq(patientProfiles.status, 'active'),
            sql`${patientProfiles.userId} IS NOT NULL`,
          ),
        );

      const recipientUserIds = [
        ...new Set(
          activePatients
            .map((p) => p.userId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      if (recipientUserIds.length === 0) {
        this.logger.warn('No active external patient users found for promo broadcast.');
        await this.promoRepo.markBroadcastDispatched(promo.id);
        return true;
      }

      const channels =
        promo.broadcastChannels && promo.broadcastChannels.length > 0
          ? (promo.broadcastChannels as Array<'push' | 'in_app' | 'email'>)
          : (['in_app', 'push'] as const);

      const command: NotificationDispatchCommand = {
        commandId: randomUUID(),
        sourceDomain: 'promotions',
        audience: 'external',
        target: {
          type: 'user',
          recipientUserIds,
        },
        category: 'promotion',
        content: {
          title: promo.title,
          body: promo.summary,
          data: {
            promoId: promo.id,
            serviceId: promo.serviceId || undefined,
            ctaUrl: promo.ctaUrl || undefined,
          },
        },
        channels: [...channels],
        priority: 'normal',
      };

      const dispatched = await this.notificationGateway.dispatch(command);
      await this.promoRepo.markBroadcastDispatched(promo.id);

      this.logger.log(
        `[✓] Promo broadcast dispatched successfully to ${recipientUserIds.length} users. Command: ${command.commandId}`,
      );
      return dispatched;
    } catch (err) {
      this.logger.error(
        `Failed to broadcast promo "${promo.title}" (${promo.id}): ${String(err)}`,
      );
      return false;
    }
  }

  async processScheduledBroadcasts(): Promise<number> {
    const pending = await this.promoRepo.findPendingBroadcastPromotions();
    if (pending.length === 0) return 0;

    this.logger.log(
      `Found ${pending.length} scheduled promo(s) ready for broadcast. Processing...`,
    );

    let count = 0;
    for (const promo of pending) {
      const ok = await this.broadcastPromotion(promo);
      if (ok) count++;
    }

    return count;
  }
}

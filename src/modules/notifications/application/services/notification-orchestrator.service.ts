import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  NOTIFICATION_AUDIENCE,
  NotificationAudience,
} from '../../../../common/constants/notification-audience.constants';
import { roles, userRoles } from '../../../../database/schema';
import { DeliveryChannelAdapter } from '../../contracts/delivery-channel.interface';
import { DomainEvent } from '../../contracts/domain-event.interface';
import { NotificationIntent } from '../../domain/entities/notification-rule.entity';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import {
  DELIVERY_CHANNEL_ADAPTERS,
  NOTIFICATION_REPOSITORY,
  NotificationChannel,
} from '../../notifications.constants';
import { NotificationRulesRegistry } from '../../registry/notification-rules-registry';

@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);
  private readonly adapterMap = new Map<
    NotificationChannel,
    DeliveryChannelAdapter
  >();

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: NotificationRepository,
    private readonly rulesRegistry: NotificationRulesRegistry,
    @Inject(DELIVERY_CHANNEL_ADAPTERS)
    private readonly channelAdapters: DeliveryChannelAdapter[],
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {
    for (const adapter of this.channelAdapters) {
      this.adapterMap.set(adapter.channel, adapter);
    }
  }

  async processEvent(event: DomainEvent): Promise<void> {
    const rule = this.rulesRegistry.getRule(event.eventType);
    if (!rule) {
      this.logger.debug(
        `No notification rule registered for event type "${event.eventType}", ignoring.`,
      );
      return;
    }

    // Paradigm 2: Satu intent, satu audience
    if (rule.resolveIntents) {
      const intents = await Promise.resolve(
        rule.resolveIntents(event.payload, event.actor),
      );
      if (!Array.isArray(intents) || intents.length === 0) {
        this.logger.debug(
          `No notification intents resolved for event "${event.eventType}" [id: ${event.eventId}].`,
        );
        return;
      }

      for (const intent of intents) {
        await this.processIntent(event, rule, intent);
      }
      return;
    }

    // Fallback: Legacy rule resolution
    if (rule.resolveRecipients) {
      await this.processLegacyRecipients(event, rule);
    }
  }

  private async processIntent(
    event: DomainEvent,
    rule: any,
    intent: NotificationIntent,
  ): Promise<void> {
    const recipientId = intent.recipientUserId;
    if (!recipientId || typeof recipientId !== 'string') return;

    // Invariant guard: Fail closed if recipient role audience is incompatible with intent audience
    const recipientAudiences = await this.getRecipientAudiences(recipientId);
    if (!this.isAudienceCompatible(intent.audience, recipientAudiences)) {
      this.logger.warn(
        `[INVARIANT GUARD] Dropped ${intent.audience} notification for recipient ${recipientId} (recipientAudiences=${recipientAudiences.join(',') || 'none'}). Fail-closed invariant triggered.`,
      );
      return;
    }

    const idempotencyKey = `${event.eventId}:${recipientId}:${intent.audience}:${event.eventType}`;
    const source = rule.resolveSource?.(event.payload);

    try {
      const persisted = await this.notificationRepo.createIfNotExists({
        idempotencyKey,
        category: rule.category,
        audience: intent.audience,
        title: intent.title,
        body: intent.body,
        senderName: intent.senderName || 'Klinik Amanah',
        senderRole:
          intent.senderRole ||
          (intent.audience === NOTIFICATION_AUDIENCE.EXTERNAL
            ? 'Klinik'
            : 'Pendaftaran'),
        badgeIcon: intent.badgeIcon || rule.badgeIcon,
        metaIcon: intent.metaIcon || rule.metaIcon,
        visualKey: intent.visualKey ?? null,
        isUrgent: intent.isUrgent ?? false,
        sourceType: source?.sourceType ?? null,
        sourceId: source?.sourceId ?? null,
        metadata: {
          eventId: event.eventId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          occurredAt: event.occurredAt,
          audience: intent.audience,
          presentationToast: intent.presentation?.toast !== false,
          semanticAction: intent.action,
          ...event.payload,
        },
        recipientUserIds: [recipientId],
        actions: intent.actions || rule.resolveActions?.(event.payload),
      });

      if (!persisted) {
        this.logger.debug(
          `Duplicate notification skipped for idempotency key "${idempotencyKey}".`,
        );
        return;
      }

      for (const channelName of rule.defaultChannels) {
        const adapter = this.adapterMap.get(channelName);
        if (adapter) {
          await adapter.deliver(persisted, recipientId);
        } else {
          this.logger.warn(
            `No adapter registered for channel "${channelName}", skipping delivery.`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to process notification intent for recipient ${recipientId} [key: ${idempotencyKey}]: ${error}`,
      );
    }
  }

  private async processLegacyRecipients(
    event: DomainEvent,
    rule: any,
  ): Promise<void> {
    const rawRecipients = await Promise.resolve(
      rule.resolveRecipients(event.payload),
    );
    const recipients = Array.isArray(rawRecipients)
      ? rawRecipients
      : [rawRecipients];
    const validRecipients = recipients.filter(
      (r): r is string => typeof r === 'string' && r.trim().length > 0,
    );

    if (validRecipients.length === 0) return;

    const title =
      typeof rule.titleTemplate === 'function'
        ? rule.titleTemplate(event.payload)
        : rule.titleTemplate;
    const body =
      typeof rule.bodyTemplate === 'function'
        ? rule.bodyTemplate(event.payload)
        : rule.bodyTemplate;
    const isUrgent =
      typeof rule.isUrgent === 'function'
        ? rule.isUrgent(event.payload)
        : (rule.isUrgent ?? false);
    const source = rule.resolveSource?.(event.payload);
    const actions = rule.resolveActions?.(event.payload);

    for (const recipientId of validRecipients) {
      const idempotencyKey = `${event.eventId}:${recipientId}:${event.eventType}`;
      try {
        const persisted = await this.notificationRepo.createIfNotExists({
          idempotencyKey,
          category: rule.category,
          audience: NOTIFICATION_AUDIENCE.INTERNAL,
          title,
          body,
          senderName: rule.senderName
            ? typeof rule.senderName === 'function'
              ? rule.senderName(event.payload)
              : rule.senderName
            : 'Klinik Amanah',
          senderRole: rule.senderRole
            ? typeof rule.senderRole === 'function'
              ? rule.senderRole(event.payload)
              : rule.senderRole
            : 'Pendaftaran',
          badgeIcon: rule.badgeIcon,
          metaIcon: rule.metaIcon,
          visualKey:
            typeof rule.visualKey === 'function'
              ? rule.visualKey(event.payload)
              : (rule.visualKey ?? null),
          isUrgent,
          sourceType: source?.sourceType ?? null,
          sourceId: source?.sourceId ?? null,
          metadata: {
            eventId: event.eventId,
            eventType: event.eventType,
            correlationId: event.correlationId,
            occurredAt: event.occurredAt,
            ...event.payload,
          },
          recipientUserIds: [recipientId],
          actions,
        });

        if (!persisted) continue;

        for (const channelName of rule.defaultChannels) {
          const adapter = this.adapterMap.get(channelName);
          if (adapter) {
            await adapter.deliver(persisted, recipientId);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to process legacy notification: ${error}`);
      }
    }
  }

  private async getRecipientAudiences(
    userId: string,
  ): Promise<NotificationAudience[]> {
    if (!this.db) return [];
    try {
      const records = await this.db
        .selectDistinct({ audience: roles.audience })
        .from(userRoles)
        .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
        .where(
          and(
            eq(userRoles.userId, userId),
            isNull(userRoles.revokedAt),
          ),
        );

      return records
        .map((r) => r.audience as NotificationAudience)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private isAudienceCompatible(
    targetAudience: NotificationAudience,
    recipientAudiences: NotificationAudience[],
  ): boolean {
    if (targetAudience === NOTIFICATION_AUDIENCE.ALL) return true;
    if (recipientAudiences.length === 0) {
      // Default unassigned user (e.g. registered patient without explicitly assigned userRoles) to external
      return targetAudience === NOTIFICATION_AUDIENCE.EXTERNAL;
    }
    return recipientAudiences.includes(targetAudience);
  }
}

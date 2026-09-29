import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeliveryChannelAdapter } from '../../contracts/delivery-channel.interface';
import { DomainEvent } from '../../contracts/domain-event.interface';
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

    const rawRecipients = await Promise.resolve(
      rule.resolveRecipients(event.payload),
    );
    const recipients = Array.isArray(rawRecipients)
      ? rawRecipients
      : [rawRecipients];
    const validRecipients = recipients.filter(
      (r): r is string => typeof r === 'string' && r.trim().length > 0,
    );

    if (validRecipients.length === 0) {
      this.logger.debug(
        `No recipients resolved for event "${event.eventType}" [id: ${event.eventId}], skipping.`,
      );
      return;
    }

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

    const resolvedSenderName =
      typeof rule.senderName === 'function'
        ? rule.senderName(event.payload)
        : (rule.senderName ?? 'Sistem Pendaftaran');

    const rawRole = event.actor?.roleCode;
    const resolvedRole =
      typeof rawRole === 'object' && rawRole
        ? (rawRole as any).name
        : typeof rawRole === 'string'
          ? rawRole
          : 'Pendaftaran';

    const resolvedSenderRole =
      typeof rule.senderRole === 'function'
        ? rule.senderRole(event.payload)
        : (rule.senderRole ?? resolvedRole);

    const resolvedVisualKey =
      typeof rule.visualKey === 'function'
        ? rule.visualKey(event.payload)
        : (rule.visualKey ?? null);

    for (const recipientId of validRecipients) {
      const idempotencyKey = `${event.eventId}:${recipientId}:${event.eventType}`;

      try {
        const persisted = await this.notificationRepo.createIfNotExists({
          idempotencyKey,
          category: rule.category,
          title,
          body,
          senderName: resolvedSenderName,
          senderRole: resolvedSenderRole,
          badgeIcon: rule.badgeIcon,
          metaIcon: rule.metaIcon,
          visualKey: resolvedVisualKey ?? null,
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

        if (!persisted) {
          this.logger.debug(
            `Duplicate notification skipped for idempotency key "${idempotencyKey}".`,
          );
          continue;
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
          `Failed to process notification for recipient ${recipientId} [key: ${idempotencyKey}]: ${error}`,
        );
      }
    }
  }
}

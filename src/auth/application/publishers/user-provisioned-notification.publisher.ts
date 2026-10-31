import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  type DomainEvent,
  type NotificationPublisher,
} from '../../../modules/notifications/contracts/domain-event.interface';
import {
  NOTIFICATION_PUBLISHER,
  REALTIME_ROOMS,
} from '../../../modules/notifications/notifications.constants';
import { SocketIoRealtimeGateway } from '../../../modules/notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { AUTH_EVENTS } from '../../domain/constants/auth-events.constants';

export interface UserProvisionedPublishParams {
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  roleCode: string;
  audience: string;
  avatarUrl?: string | null;
  actorUserId?: string | null;
}

@Injectable()
export class UserProvisionedNotificationPublisher {
  private readonly logger = new Logger(UserProvisionedNotificationPublisher.name);

  constructor(
    @Optional()
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notificationPublisher?: NotificationPublisher,
    @Optional()
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
  ) {}

  async publishUserProvisioned(params: UserProvisionedPublishParams): Promise<void> {
    const occurredAt = new Date().toISOString();

    // 1. Instant real-time role count update broadcast for connected admin windows
    try {
      void this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'roles:updated',
        {
          roleId: params.roleId,
          roleCode: params.roleCode,
          action: 'user_provisioned',
          timestamp: occurredAt,
        },
      );
    } catch (err) {
      this.logger.warn(`Failed to broadcast roles:updated socket event: ${err}`);
    }

    // 2. Publish Domain Event via Redis Streams for persistent notification & toast delivery
    if (this.notificationPublisher) {
      try {
        const domainEvent: DomainEvent = {
          eventId: randomUUID(),
          eventType: AUTH_EVENTS.USER_PROVISIONED,
          version: 1,
          occurredAt,
          module: 'auth',
          payload: {
            userId: params.userId,
            name: params.name,
            email: params.email,
            roleId: params.roleId,
            roleName: params.roleName,
            roleCode: params.roleCode,
            audience: params.audience,
            avatarUrl: params.avatarUrl || null,
          },
          actor: {
            userId: params.actorUserId || undefined,
            roleCode: params.roleCode,
          },
        };

        await this.notificationPublisher.publish(domainEvent);
        this.logger.debug(
          `Published ${AUTH_EVENTS.USER_PROVISIONED} domain event [id: ${domainEvent.eventId}] for user ${params.userId}`,
        );
      } catch (error) {
        this.logger.error(`Failed to publish user provisioned domain event: ${error}`);
      }
    }
  }
}

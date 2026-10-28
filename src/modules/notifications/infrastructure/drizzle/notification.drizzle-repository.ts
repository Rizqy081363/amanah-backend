import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  notificationActions,
  notificationRecipients,
  notifications,
} from '../../../../database/schema';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { NotificationRepository } from '../../domain/repositories/notification.repository';

@Injectable()
export class NotificationDrizzleRepository implements NotificationRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async findMyNotifications(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    },
  ): Promise<{
    data: NotificationEntity[];
    total: number;
    unreadCount: number;
  }> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Count unread notifications
    const [unreadResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationRecipients)
      .where(
        and(
          eq(notificationRecipients.userId, userId),
          isNull(notificationRecipients.readAt),
          isNull(notificationRecipients.dismissedAt),
        ),
      );
    const unreadCount = unreadResult?.count ?? 0;

    // Fetch recipient records joined with notifications
    const conditions = [eq(notificationRecipients.userId, userId)];
    if (options?.unreadOnly) {
      conditions.push(isNull(notificationRecipients.readAt));
    }

    const records = await this.db.query.notificationRecipients.findMany({
      where: and(...conditions),
      limit,
      offset,
      orderBy: [desc(notificationRecipients.createdAt)],
      with: {
        notification: {
          with: {
            notificationActions: true,
          },
        },
      },
    });

    const data: NotificationEntity[] = records
      .filter((r) => r.notification != null)
      .map((r) => {
        const notif = r.notification;
        return {
          id: notif.id,
          category: notif.category,
          audience: notif.audience as any,
          title: notif.title,
          senderName: notif.senderName,
          senderRole: notif.senderRole,
          badgeIcon: notif.badgeIcon,
          metaIcon: notif.metaIcon,
          visualKey: notif.visualKey,
          body: notif.body,
          isUrgent: notif.isUrgent,
          sourceType: notif.sourceType,
          sourceId: notif.sourceId,
          metadata: (notif.metadata as Record<string, any>) ?? {},
          createdBy: notif.createdBy,
          expiresAt: notif.expiresAt,
          createdAt: notif.createdAt,
          updatedAt: notif.updatedAt,
          isRead: r.readAt != null,
          recipient: {
            id: r.id,
            notificationId: r.notificationId,
            userId: r.userId,
            deliveredAt: r.deliveredAt,
            readAt: r.readAt,
            dismissedAt: r.dismissedAt,
            createdAt: r.createdAt,
          },
          actions: notif.notificationActions.map((a) => ({
            id: a.id,
            notificationId: a.notificationId,
            label: a.label,
            actionKey: a.actionKey,
            actionType: a.actionType,
            icon: a.icon,
            url: a.url,
            metadata: (a.metadata as Record<string, any>) ?? {},
            createdAt: a.createdAt,
          })),
        };
      });

    const [totalResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationRecipients)
      .where(and(...conditions));
    const total = totalResult?.count ?? data.length;

    return {
      data,
      total,
      unreadCount,
    };
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const updated = await this.db
      .update(notificationRecipients)
      .set({
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(notificationRecipients.notificationId, notificationId),
          eq(notificationRecipients.userId, userId),
        ),
      )
      .returning();

    return updated.length > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const updated = await this.db
      .update(notificationRecipients)
      .set({
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(notificationRecipients.userId, userId),
          isNull(notificationRecipients.readAt),
        ),
      )
      .returning();

    return updated.length;
  }

  async createNotification(data: {
    category:
      | 'clinical'
      | 'system'
      | 'announcement'
      | 'billing'
      | 'schedule'
      | 'attendance'
      | 'permission'
      | 'appointment'
      | 'promotion'
      | 'lab_result'
      | 'queue'
      | 'shift'
      | 'pharmacy'
      | 'telemedicine'
      | 'support'
      | string;
    title?: string;
    body: string;
    senderName?: string;
    senderRole?: string;
    isUrgent?: boolean;
    recipientUserIds: string[];
    actions?: Array<{
      label: string;
      actionKey: string;
      actionType?:
        | 'primary'
        | 'secondary'
        | 'warning'
        | 'info'
        | 'danger'
        | 'link'
        | string;
      url?: string;
    }>;
  }): Promise<NotificationEntity> {
    const validCategories = [
      'appointment',
      'promotion',
      'lab_result',
      'queue',
      'clinical',
      'shift',
      'pharmacy',
      'telemedicine',
      'support',
      'system',
    ];

    let dbCategory: any = 'system';
    if (validCategories.includes(data.category)) {
      dbCategory = data.category;
    } else if (
      data.category === 'schedule' ||
      data.category === 'attendance' ||
      data.category === 'permission'
    ) {
      dbCategory = 'shift';
    } else {
      dbCategory = 'system';
    }

    const [notif] = await this.db
      .insert(notifications)
      .values({
        category: dbCategory,
        title: data.title ?? null,
        body: data.body,
        senderName: data.senderName ?? null,
        senderRole: data.senderRole ?? null,
        isUrgent: data.isUrgent ?? false,
      })
      .returning();

    if (data.recipientUserIds.length > 0) {
      await this.db.insert(notificationRecipients).values(
        data.recipientUserIds.map((userId) => ({
          notificationId: notif.id,
          userId,
          deliveredAt: new Date().toISOString(),
        })),
      );
    }

    if (data.actions && data.actions.length > 0) {
      await this.db.insert(notificationActions).values(
        data.actions.map((act) => {
          let actType: 'primary' | 'secondary' | 'warning' | 'info' =
            'secondary';
          if (act.actionType === 'primary') actType = 'primary';
          else if (act.actionType === 'danger' || act.actionType === 'warning')
            actType = 'warning';
          else if (act.actionType === 'link' || act.actionType === 'info')
            actType = 'info';
          else actType = 'secondary';

          return {
            notificationId: notif.id,
            label: act.label,
            actionKey: act.actionKey,
            actionType: actType,
            url: act.url ?? null,
          };
        }),
      );
    }

    return {
      id: notif.id,
      category: notif.category,
      title: notif.title,
      body: notif.body,
      isUrgent: notif.isUrgent,
      senderName: notif.senderName,
      senderRole: notif.senderRole,
      createdAt: notif.createdAt,
      updatedAt: notif.updatedAt,
      isRead: false,
    };
  }

  async createIfNotExists(data: {
    idempotencyKey?: string;
    category: string;
    audience?: 'patient' | 'clinic' | string;
    title?: string | null;
    body: string;
    senderName?: string | null;
    senderRole?: string | null;
    badgeIcon?: string | null;
    metaIcon?: string | null;
    visualKey?: string | null;
    isUrgent?: boolean;
    sourceType?: string | null;
    sourceId?: string | null;
    metadata?: Record<string, any>;
    recipientUserIds: string[];
    actions?: Array<{
      label: string;
      actionKey: string;
      actionType?: string;
      url?: string;
    }>;
  }): Promise<NotificationEntity | null> {
    if (data.idempotencyKey) {
      const existing = await this.db.query.notifications.findFirst({
        where: eq(notifications.idempotencyKey, data.idempotencyKey),
      });
      if (existing) {
        return null;
      }
    }

    const validCategories = [
      'appointment',
      'promotion',
      'lab_result',
      'queue',
      'clinical',
      'shift',
      'pharmacy',
      'telemedicine',
      'support',
      'system',
    ];

    let dbCategory: any = 'system';
    if (validCategories.includes(data.category)) {
      dbCategory = data.category;
    } else if (
      data.category === 'schedule' ||
      data.category === 'attendance' ||
      data.category === 'permission'
    ) {
      dbCategory = 'shift';
    } else {
      dbCategory = 'system';
    }

    try {
      const insertQuery = this.db.insert(notifications).values({
        idempotencyKey: data.idempotencyKey ?? null,
        category: dbCategory,
        audience: data.audience ?? 'clinic',
        title: data.title ?? null,
        body: data.body,
        senderName: data.senderName ?? null,
        senderRole: data.senderRole ?? null,
        badgeIcon: data.badgeIcon ?? null,
        metaIcon: data.metaIcon ?? null,
        visualKey: data.visualKey ?? null,
        isUrgent: data.isUrgent ?? false,
        sourceType: data.sourceType ?? null,
        sourceId: data.sourceId ?? null,
        metadata: data.metadata ?? {},
      });

      const inserted = data.idempotencyKey
        ? await insertQuery
            .onConflictDoNothing({ target: notifications.idempotencyKey })
            .returning()
        : await insertQuery.returning();

      if (!inserted || inserted.length === 0) {
        return null;
      }

      const notif = inserted[0];

      if (data.recipientUserIds.length > 0) {
        await this.db.insert(notificationRecipients).values(
          data.recipientUserIds.map((userId) => ({
            notificationId: notif.id,
            userId,
            deliveredAt: new Date().toISOString(),
          })),
        );
      }

      if (data.actions && data.actions.length > 0) {
        await this.db.insert(notificationActions).values(
          data.actions.map((act) => {
            let actType: 'primary' | 'secondary' | 'warning' | 'info' =
              'secondary';
            if (act.actionType === 'primary') actType = 'primary';
            else if (
              act.actionType === 'danger' ||
              act.actionType === 'warning'
            )
              actType = 'warning';
            else if (act.actionType === 'link' || act.actionType === 'info')
              actType = 'info';
            else actType = 'secondary';

            return {
              notificationId: notif.id,
              label: act.label,
              actionKey: act.actionKey,
              actionType: actType,
              url: act.url ?? null,
            };
          }),
        );
      }

      return {
        id: notif.id,
        category: notif.category,
        audience: notif.audience as any,
        title: notif.title,
        body: notif.body,
        isUrgent: notif.isUrgent,
        senderName: notif.senderName,
        senderRole: notif.senderRole,
        badgeIcon: notif.badgeIcon,
        metaIcon: notif.metaIcon,
        visualKey: notif.visualKey,
        sourceType: notif.sourceType,
        sourceId: notif.sourceId,
        idempotencyKey: notif.idempotencyKey,
        metadata: (notif.metadata as Record<string, any>) ?? {},
        createdAt: notif.createdAt,
        updatedAt: notif.updatedAt,
        isRead: false,
      };
    } catch (error: any) {
      if (error?.code === '23505') {
        return null;
      }
      throw error;
    }
  }
}

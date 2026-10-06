import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  PushSubscriptionDbRecord,
  pushSubscriptions,
} from '../../../../database/schema/push-subscriptions.schema';
import {
  PushSubscriptionRepository,
  SavePushSubscriptionParams,
} from '../../domain/repositories/push-subscription.repository';

@Injectable()
export class PushSubscriptionDrizzleRepository
  implements PushSubscriptionRepository
{
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async upsert(
    params: SavePushSubscriptionParams,
  ): Promise<PushSubscriptionDbRecord> {
    const [result] = await this.db
      .insert(pushSubscriptions)
      .values({
        userId: params.userId,
        endpoint: params.endpoint,
        p256dhKey: params.p256dhKey,
        authKey: params.authKey,
        platform: params.platform || 'web',
        userAgent: params.userAgent || null,
        updatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
        set: {
          p256dhKey: params.p256dhKey,
          authKey: params.authKey,
          platform: params.platform || 'web',
          userAgent: params.userAgent || null,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    return result;
  }

  async findByUserId(userId: string): Promise<PushSubscriptionDbRecord[]> {
    return this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  async findByUserIds(userIds: string[]): Promise<PushSubscriptionDbRecord[]> {
    if (!userIds || userIds.length === 0) return [];
    return this.db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));
  }

  async findAllActive(): Promise<PushSubscriptionDbRecord[]> {
    return this.db.select().from(pushSubscriptions);
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async deleteByUserIdAndEndpoint(
    userId: string,
    endpoint: string,
  ): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
  }
}

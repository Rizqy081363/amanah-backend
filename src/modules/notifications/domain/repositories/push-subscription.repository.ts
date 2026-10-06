import { PushSubscriptionDbRecord } from '../../../../database/schema/push-subscriptions.schema';

export const PUSH_SUBSCRIPTION_REPOSITORY = Symbol.for(
  'PUSH_SUBSCRIPTION_REPOSITORY',
);

export interface SavePushSubscriptionParams {
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  platform?: string;
  userAgent?: string;
}

export interface PushSubscriptionRepository {
  upsert(params: SavePushSubscriptionParams): Promise<PushSubscriptionDbRecord>;
  findByUserId(userId: string): Promise<PushSubscriptionDbRecord[]>;
  findByUserIds(userIds: string[]): Promise<PushSubscriptionDbRecord[]>;
  findAllActive(): Promise<PushSubscriptionDbRecord[]>;
  deleteByEndpoint(endpoint: string): Promise<void>;
  deleteByUserIdAndEndpoint(userId: string, endpoint: string): Promise<void>;
}

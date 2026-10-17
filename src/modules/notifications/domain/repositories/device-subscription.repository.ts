export interface RegisterDeviceDto {
  userId: string;
  pushToken: string;
  platform: 'android' | 'ios' | 'web';
  deviceIdentifier?: string;
  deviceName?: string;
  appVersion?: string;
  osVersion?: string;
}

export interface ActiveDeviceToken {
  id: string;
  userId: string;
  pushToken: string;
  platform: string;
}

export const DEVICE_SUBSCRIPTION_REPOSITORY = Symbol.for(
  'DEVICE_SUBSCRIPTION_REPOSITORY',
);

export interface DeviceSubscriptionRepository {
  upsertDeviceToken(dto: RegisterDeviceDto): Promise<{ id: string }>;
  findActiveTokensByUserIds(userIds: string[]): Promise<ActiveDeviceToken[]>;
  revokeDeviceToken(userId: string, token: string): Promise<void>;
  markTokenInvalid(tokenId: string): Promise<void>;
}

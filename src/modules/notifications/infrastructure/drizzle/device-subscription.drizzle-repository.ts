import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { userDevices } from '../../../../database/schema/amanah.schema';
import {
  ActiveDeviceToken,
  DeviceSubscriptionRepository,
  RegisterDeviceDto,
} from '../../domain/repositories/device-subscription.repository';

@Injectable()
export class DeviceSubscriptionDrizzleRepository
  implements DeviceSubscriptionRepository
{
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async upsertDeviceToken(dto: RegisterDeviceDto): Promise<{ id: string }> {
    const rawIdentifier =
      dto.deviceIdentifier || `device-${dto.userId}-${dto.platform}`;
    const deviceIdentifierHash = this.hash(rawIdentifier);
    const pushTokenHash = this.hash(dto.pushToken);

    const [existing] = await this.db
      .select({ id: userDevices.id })
      .from(userDevices)
      .where(
        and(
          eq(userDevices.userId, dto.userId),
          eq(userDevices.deviceIdentifierHash, deviceIdentifierHash),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(userDevices)
        .set({
          platform: dto.platform,
          pushTokenHash,
          pushTokenEncrypted: dto.pushToken,
          deviceName: dto.deviceName || null,
          appVersion: dto.appVersion || null,
          osVersion: dto.osVersion || null,
          revokedAt: null,
          lastSeenAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(userDevices.id, existing.id))
        .returning({ id: userDevices.id });

      return { id: updated.id };
    }

    const [inserted] = await this.db
      .insert(userDevices)
      .values({
        userId: dto.userId,
        platform: dto.platform,
        deviceIdentifierHash,
        deviceName: dto.deviceName || null,
        appVersion: dto.appVersion || null,
        osVersion: dto.osVersion || null,
        pushTokenHash,
        pushTokenEncrypted: dto.pushToken,
        revokedAt: null,
        lastSeenAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .returning({ id: userDevices.id });

    return { id: inserted.id };
  }

  async findActiveTokensByUserIds(
    userIds: string[],
  ): Promise<ActiveDeviceToken[]> {
    if (!userIds || userIds.length === 0) return [];

    const rows = await this.db
      .select({
        id: userDevices.id,
        userId: userDevices.userId,
        pushToken: userDevices.pushTokenEncrypted,
        platform: userDevices.platform,
      })
      .from(userDevices)
      .where(
        and(
          inArray(userDevices.userId, userIds),
          isNull(userDevices.revokedAt),
          sql`${userDevices.pushTokenEncrypted} IS NOT NULL`,
        ),
      );

    return rows
      .filter((r): r is typeof r & { pushToken: string } => Boolean(r.pushToken))
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        pushToken: r.pushToken,
        platform: r.platform,
      }));
  }

  async revokeDeviceToken(userId: string, token: string): Promise<void> {
    const pushTokenHash = this.hash(token);
    await this.db
      .update(userDevices)
      .set({
        revokedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(userDevices.userId, userId),
          eq(userDevices.pushTokenHash, pushTokenHash),
        ),
      );
  }

  async markTokenInvalid(tokenId: string): Promise<void> {
    await this.db
      .update(userDevices)
      .set({
        revokedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(userDevices.id, tokenId));
  }
}

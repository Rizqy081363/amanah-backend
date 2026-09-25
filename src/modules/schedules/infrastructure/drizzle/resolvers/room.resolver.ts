import { Inject, Injectable } from '@nestjs/common';
import { eq, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { clinicRooms } from '../../../../../database/schema';
import { isUuid } from '../../../domain/constants/schedule.constants';

@Injectable()
export class RoomResolver {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async resolveRoomId(
    roomId?: string | null,
    poliklinikId?: string | null,
  ): Promise<string | null> {
    if (roomId) {
      return roomId;
    }
    if (!poliklinikId) {
      return null;
    }

    const room = await this.db.query.clinicRooms.findFirst({
      where: eq(clinicRooms.unitId, poliklinikId),
    });
    return room?.id ?? null;
  }

  async resolveByNameOrId(roomIdentifier: string): Promise<string | null> {
    if (!roomIdentifier) return null;

    if (isUuid(roomIdentifier)) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.id, roomIdentifier),
      });
      return room?.id ?? null;
    }

    const firstChunk = roomIdentifier.split(',')[0].trim();
    const room = await this.db.query.clinicRooms.findFirst({
      where: or(
        eq(clinicRooms.name, roomIdentifier),
        eq(clinicRooms.code, roomIdentifier),
        sql`lower(${clinicRooms.name}) LIKE lower(${`%${firstChunk}%`})`,
      ),
    });
    return room?.id ?? null;
  }
}

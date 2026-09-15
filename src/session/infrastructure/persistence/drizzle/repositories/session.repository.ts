import { Injectable, Inject } from '@nestjs/common';
import { eq, and, ne, isNull } from 'drizzle-orm';
import { SessionRepository } from '../../session.repository';
import { Session } from '../../../../domain/session';
import { User } from '../../../../../users/domain/user';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { sessions } from '../../../../../database/schema';
import { SessionMapper } from '../mappers/session.mapper';

@Injectable()
export class SessionDrizzleRepository implements SessionRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async findById(id: Session['id']): Promise<NullableType<Session>> {
    const record = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.id, Number(id)), isNull(sessions.deletedAt)),
      with: {
        user: {
          with: {
            photo: true,
            role: true,
            status: true,
          },
        },
      },
    });

    return record ? SessionMapper.toDomain(record) : null;
  }

  async create(data: Session): Promise<Session> {
    const [record] = await this.db
      .insert(sessions)
      .values({
        userId: Number(data.user.id),
        hash: data.hash,
      })
      .returning();

    return this.findById(record.id) as Promise<Session>;
  }

  async update(
    id: Session['id'],
    payload: Partial<
      Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
  ): Promise<Session | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (payload.hash !== undefined) {
      updateValues.hash = payload.hash;
    }

    if (payload.user !== undefined) {
      updateValues.userId = Number(payload.user.id);
    }

    const [updated] = await this.db
      .update(sessions)
      .set(updateValues)
      .where(and(eq(sessions.id, Number(id)), isNull(sessions.deletedAt)))
      .returning();

    if (!updated) {
      return null;
    }

    return this.findById(updated.id);
  }

  async updateByHash(
    conditions: { id: Session['id']; hash: Session['hash'] },
    payload: Partial<
      Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
  ): Promise<Session | null> {
    const [updated] = await this.db
      .update(sessions)
      .set({
        hash: payload.hash,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sessions.id, Number(conditions.id)),
          eq(sessions.hash, conditions.hash),
          isNull(sessions.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      return null;
    }

    return this.findById(updated.id);
  }

  async deleteById(id: Session['id']): Promise<void> {
    await this.db
      .update(sessions)
      .set({ deletedAt: new Date() })
      .where(eq(sessions.id, Number(id)));
  }

  async deleteByUserId(conditions: { userId: User['id'] }): Promise<void> {
    await this.db
      .update(sessions)
      .set({ deletedAt: new Date() })
      .where(eq(sessions.userId, Number(conditions.userId)));
  }

  async deleteByUserIdWithExclude(conditions: {
    userId: User['id'];
    excludeSessionId: Session['id'];
  }): Promise<void> {
    await this.db
      .update(sessions)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, Number(conditions.userId)),
          ne(sessions.id, Number(conditions.excludeSessionId)),
        ),
      );
  }
}

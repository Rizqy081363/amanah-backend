import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { users } from '../../../../../database/schema';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { IPaginationOptions } from '../../../../../utils/types/pagination-options';
import { User } from '../../../../domain/user';
import { FilterUserDto, SortUserDto } from '../../../../dto/query-user.dto';
import { UserRepository } from '../../user.repository';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class UsersDrizzleRepository implements UserRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async create(
    data: Omit<User, 'id' | 'createdAt' | 'deletedAt' | 'updatedAt'>,
  ): Promise<User> {
    const [record] = await this.db
      .insert(users)
      .values({
        email: data.email,
        password: data.password,
        provider: data.provider,
        socialId: data.socialId,
        firstName: data.firstName,
        lastName: data.lastName,
        photoId: data.photo?.id ?? null,
        roleId: data.role ? Number(data.role.id) : null,
        statusId: data.status ? Number(data.status.id) : null,
      })
      .returning();

    return (await this.findById(record.id)) as User;
  }

  async findManyWithPagination({
    filterOptions,
    sortOptions,
    paginationOptions,
  }: {
    filterOptions?: FilterUserDto | null;
    sortOptions?: SortUserDto[] | null;
    paginationOptions: IPaginationOptions;
  }): Promise<User[]> {
    const conditions = [isNull(users.deletedAt)];

    if (filterOptions?.roles?.length) {
      const roleIds = filterOptions.roles.map((r) => Number(r.id));
      conditions.push(inArray(users.roleId, roleIds));
    }

    const orderByClauses =
      sortOptions?.map((sort) => {
        const col = users[sort.orderBy as keyof typeof users];
        return sort.order.toUpperCase() === 'DESC'
          ? desc(col as any)
          : asc(col as any);
      }) || [];

    const records = await this.db.query.users.findMany({
      where: and(...conditions),
      limit: paginationOptions.limit,
      offset: (paginationOptions.page - 1) * paginationOptions.limit,
      orderBy: orderByClauses.length ? orderByClauses : undefined,
      with: {
        photo: true,
        role: true,
        status: true,
      },
    });

    return records.map((record) => UserMapper.toDomain(record));
  }

  async findById(id: User['id']): Promise<NullableType<User>> {
    const record = await this.db.query.users.findFirst({
      where: and(eq(users.id, Number(id)), isNull(users.deletedAt)),
      with: {
        photo: true,
        role: true,
        status: true,
      },
    });

    return record ? UserMapper.toDomain(record) : null;
  }

  async findByIds(ids: User['id'][]): Promise<User[]> {
    if (!ids.length) return [];

    const records = await this.db.query.users.findMany({
      where: and(
        inArray(
          users.id,
          ids.map((id) => Number(id)),
        ),
        isNull(users.deletedAt),
      ),
      with: {
        photo: true,
        role: true,
        status: true,
      },
    });

    return records.map((record) => UserMapper.toDomain(record));
  }

  async findByEmail(email: User['email']): Promise<NullableType<User>> {
    if (!email) return null;

    const record = await this.db.query.users.findFirst({
      where: and(eq(users.email, email), isNull(users.deletedAt)),
      with: {
        photo: true,
        role: true,
        status: true,
      },
    });

    return record ? UserMapper.toDomain(record) : null;
  }

  async findBySocialIdAndProvider({
    socialId,
    provider,
  }: {
    socialId: User['socialId'];
    provider: User['provider'];
  }): Promise<NullableType<User>> {
    if (!socialId || !provider) return null;

    const record = await this.db.query.users.findFirst({
      where: and(
        eq(users.socialId, socialId),
        eq(users.provider, provider),
        isNull(users.deletedAt),
      ),
      with: {
        photo: true,
        role: true,
        status: true,
      },
    });

    return record ? UserMapper.toDomain(record) : null;
  }

  async update(id: User['id'], payload: Partial<User>): Promise<User | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (payload.email !== undefined) updateValues.email = payload.email;
    if (payload.password !== undefined)
      updateValues.password = payload.password;
    if (payload.provider !== undefined)
      updateValues.provider = payload.provider;
    if (payload.socialId !== undefined)
      updateValues.socialId = payload.socialId;
    if (payload.firstName !== undefined)
      updateValues.firstName = payload.firstName;
    if (payload.lastName !== undefined)
      updateValues.lastName = payload.lastName;
    if (payload.photo !== undefined)
      updateValues.photoId = payload.photo?.id ?? null;
    if (payload.role !== undefined)
      updateValues.roleId = payload.role ? Number(payload.role.id) : null;
    if (payload.status !== undefined)
      updateValues.statusId = payload.status ? Number(payload.status.id) : null;

    const [updated] = await this.db
      .update(users)
      .set(updateValues)
      .where(and(eq(users.id, Number(id)), isNull(users.deletedAt)))
      .returning();

    if (!updated) {
      return null;
    }

    return this.findById(updated.id);
  }

  async remove(id: User['id']): Promise<void> {
    await this.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, Number(id)));
  }
}

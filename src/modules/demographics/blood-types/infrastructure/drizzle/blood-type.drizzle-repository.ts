import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { bloodTypes } from '../../../../../database/schema/amanah.schema';
import type { BloodTypeEntity } from '../../domain/entities/blood-type.entity';
import {
  composeBloodTypeCode,
  type CreateBloodTypeData,
  type IBloodTypeRepository,
  type UpdateBloodTypeData,
} from '../../domain/repositories/blood-type.repository.interface';

@Injectable()
export class BloodTypeDrizzleRepository implements IBloodTypeRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapToEntity(row: typeof bloodTypes.$inferSelect): BloodTypeEntity {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      isSystem: row.isSystem,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findAll(options?: { activeOnly?: boolean; search?: string }): Promise<BloodTypeEntity[]> {
    const conditions = [];

    if (options?.activeOnly) {
      conditions.push(eq(bloodTypes.isActive, true));
    }

    if (options?.search) {
      conditions.push(ilike(bloodTypes.name, `%${options.search}%`));
    }

    const rows = await this.db.query.bloodTypes.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [asc(bloodTypes.displayOrder), asc(bloodTypes.name)],
    });

    return rows.map((r) => this.mapToEntity(r));
  }

  async findById(id: string): Promise<BloodTypeEntity | null> {
    const row = await this.db.query.bloodTypes.findFirst({
      where: eq(bloodTypes.id, id),
    });
    return row ? this.mapToEntity(row) : null;
  }

  async findByName(name: string): Promise<BloodTypeEntity | null> {
    const cleanName = name.trim();
    const row = await this.db.query.bloodTypes.findFirst({
      where: sql<boolean>`LOWER(TRIM(${bloodTypes.name})) = LOWER(TRIM(${cleanName}))`,
    });
    return row ? this.mapToEntity(row) : null;
  }

  async findByCode(code: string): Promise<BloodTypeEntity | null> {
    const row = await this.db.query.bloodTypes.findFirst({
      where: eq(bloodTypes.code, code),
    });
    return row ? this.mapToEntity(row) : null;
  }

  async create(data: CreateBloodTypeData): Promise<BloodTypeEntity> {
    const cleanName = data.name.trim().toUpperCase();
    const resolvedCode = data.code || composeBloodTypeCode(cleanName);

    let resolvedOrder = data.displayOrder;
    if (!resolvedOrder || resolvedOrder <= 0) {
      const [maxResult] = await this.db
        .select({
          maxOrder: sql<number>`COALESCE(MAX(${bloodTypes.displayOrder}), 0)::int`,
        })
        .from(bloodTypes);
      resolvedOrder = (maxResult?.maxOrder ?? 0) + 1;
    }

    const [row] = await this.db
      .insert(bloodTypes)
      .values({
        code: resolvedCode,
        name: cleanName,
        description: data.description ?? null,
        displayOrder: resolvedOrder,
        isActive: data.isActive ?? true,
        isSystem: false,
      })
      .returning();

    return this.mapToEntity(row);
  }

  async update(id: string, data: UpdateBloodTypeData): Promise<BloodTypeEntity> {
    const updateValues: Partial<typeof bloodTypes.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.code !== undefined) {
      updateValues.code = data.code;
    } else if (data.name !== undefined) {
      updateValues.code = composeBloodTypeCode(data.name);
    }

    if (data.name !== undefined) updateValues.name = data.name;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.displayOrder !== undefined) updateValues.displayOrder = data.displayOrder;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;

    const [row] = await this.db
      .update(bloodTypes)
      .set(updateValues)
      .where(eq(bloodTypes.id, id))
      .returning();

    return this.mapToEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(bloodTypes).where(eq(bloodTypes.id, id));
  }
}

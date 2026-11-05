import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { educationLevels } from '../../../../../database/schema/amanah.schema';
import type { EducationLevelEntity } from '../../domain/entities/education-level.entity';
import type {
  CreateEducationLevelData,
  IEducationLevelRepository,
  UpdateEducationLevelData,
} from '../../domain/repositories/education-level.repository.interface';

@Injectable()
export class EducationLevelDrizzleRepository implements IEducationLevelRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapToEntity(row: typeof educationLevels.$inferSelect): EducationLevelEntity {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      isSystem: row.isSystem,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findAll(options?: { activeOnly?: boolean; search?: string }): Promise<EducationLevelEntity[]> {
    const conditions = [];

    if (options?.activeOnly) {
      conditions.push(eq(educationLevels.isActive, true));
    }

    if (options?.search) {
      conditions.push(ilike(educationLevels.name, `%${options.search}%`));
    }

    const rows = await this.db.query.educationLevels.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [asc(educationLevels.displayOrder), asc(educationLevels.name)],
    });

    return rows.map((r) => this.mapToEntity(r));
  }

  async findById(id: string): Promise<EducationLevelEntity | null> {
    const row = await this.db.query.educationLevels.findFirst({
      where: eq(educationLevels.id, id),
    });
    return row ? this.mapToEntity(row) : null;
  }

  async findByName(name: string): Promise<EducationLevelEntity | null> {
    const cleanName = name.trim();
    const row = await this.db.query.educationLevels.findFirst({
      where: sql<boolean>`LOWER(TRIM(${educationLevels.name})) = LOWER(TRIM(${cleanName}))`,
    });
    return row ? this.mapToEntity(row) : null;
  }

  async create(data: CreateEducationLevelData): Promise<EducationLevelEntity> {
    const cleanName = data.name.trim();

    let resolvedOrder = data.displayOrder;
    if (!resolvedOrder || resolvedOrder <= 0) {
      const [maxResult] = await this.db
        .select({
          maxOrder: sql<number>`COALESCE(MAX(${educationLevels.displayOrder}), 0)::int`,
        })
        .from(educationLevels);
      resolvedOrder = (maxResult?.maxOrder ?? 0) + 1;
    }

    const [row] = await this.db
      .insert(educationLevels)
      .values({
        name: cleanName,
        description: data.description ?? null,
        displayOrder: resolvedOrder,
        isActive: data.isActive ?? true,
        isSystem: false,
      })
      .returning();

    return this.mapToEntity(row);
  }

  async update(id: string, data: UpdateEducationLevelData): Promise<EducationLevelEntity> {
    const updateValues: Partial<typeof educationLevels.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) updateValues.name = data.name;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.displayOrder !== undefined) updateValues.displayOrder = data.displayOrder;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;

    const [row] = await this.db
      .update(educationLevels)
      .set(updateValues)
      .where(eq(educationLevels.id, id))
      .returning();

    return this.mapToEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(educationLevels).where(eq(educationLevels.id, id));
  }
}

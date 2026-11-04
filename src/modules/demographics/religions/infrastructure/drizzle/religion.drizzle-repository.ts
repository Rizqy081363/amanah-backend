import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { religions } from '../../../../../database/schema/amanah.schema';
import type { ReligionEntity } from '../../domain/entities/religion.entity';
import type {
  CreateReligionData,
  IReligionRepository,
  UpdateReligionData,
} from '../../domain/repositories/religion.repository.interface';

@Injectable()
export class ReligionDrizzleRepository implements IReligionRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapToEntity(row: typeof religions.$inferSelect): ReligionEntity {
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

  async findAll(options?: { activeOnly?: boolean; search?: string }): Promise<ReligionEntity[]> {
    const conditions = [];

    if (options?.activeOnly) {
      conditions.push(eq(religions.isActive, true));
    }

    if (options?.search) {
      conditions.push(ilike(religions.name, `%${options.search}%`));
    }

    const rows = await this.db.query.religions.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [asc(religions.displayOrder), asc(religions.name)],
    });

    return rows.map((r) => this.mapToEntity(r));
  }

  async findById(id: string): Promise<ReligionEntity | null> {
    const row = await this.db.query.religions.findFirst({
      where: eq(religions.id, id),
    });
    return row ? this.mapToEntity(row) : null;
  }

  async findByName(name: string): Promise<ReligionEntity | null> {
    const row = await this.db.query.religions.findFirst({
      where: eq(religions.name, name),
    });
    return row ? this.mapToEntity(row) : null;
  }

  async create(data: CreateReligionData): Promise<ReligionEntity> {
    const [row] = await this.db
      .insert(religions)
      .values({
        name: data.name,
        description: data.description ?? null,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
        isSystem: false,
      })
      .returning();

    return this.mapToEntity(row);
  }

  async update(id: string, data: UpdateReligionData): Promise<ReligionEntity> {
    const updateValues: Partial<typeof religions.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) updateValues.name = data.name;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.displayOrder !== undefined) updateValues.displayOrder = data.displayOrder;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;

    const [row] = await this.db
      .update(religions)
      .set(updateValues)
      .where(eq(religions.id, id))
      .returning();

    return this.mapToEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(religions).where(eq(religions.id, id));
  }
}

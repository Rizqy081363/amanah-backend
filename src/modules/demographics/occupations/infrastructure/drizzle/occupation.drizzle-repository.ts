import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { occupations } from '../../../../../database/schema/amanah.schema';
import type { OccupationEntity } from '../../domain/entities/occupation.entity';
import type {
  CreateOccupationData,
  IOccupationRepository,
  UpdateOccupationData,
} from '../../domain/repositories/occupation.repository.interface';

@Injectable()
export class OccupationDrizzleRepository implements IOccupationRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapToEntity(row: typeof occupations.$inferSelect): OccupationEntity {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      displayOrder: row.displayOrder,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findAll(options?: { activeOnly?: boolean; search?: string }): Promise<OccupationEntity[]> {
    const conditions = [];

    if (options?.activeOnly) {
      conditions.push(eq(occupations.isActive, true));
    }

    if (options?.search) {
      conditions.push(ilike(occupations.name, `%${options.search}%`));
    }

    const rows = await this.db.query.occupations.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [asc(occupations.displayOrder), asc(occupations.name)],
    });

    return rows.map((r) => this.mapToEntity(r));
  }

  async findById(id: string): Promise<OccupationEntity | null> {
    const row = await this.db.query.occupations.findFirst({
      where: eq(occupations.id, id),
    });
    return row ? this.mapToEntity(row) : null;
  }

  async findByName(name: string): Promise<OccupationEntity | null> {
    const row = await this.db.query.occupations.findFirst({
      where: eq(occupations.name, name),
    });
    return row ? this.mapToEntity(row) : null;
  }

  async create(data: CreateOccupationData): Promise<OccupationEntity> {
    const generatedCode = data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || `occ_${Date.now()}`;

    const [row] = await this.db
      .insert(occupations)
      .values({
        code: generatedCode,
        name: data.name,
        description: data.description ?? null,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      })
      .returning();

    return this.mapToEntity(row);
  }

  async update(id: string, data: UpdateOccupationData): Promise<OccupationEntity> {
    const updateValues: Partial<typeof occupations.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) updateValues.name = data.name;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.displayOrder !== undefined) updateValues.displayOrder = data.displayOrder;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;

    const [row] = await this.db
      .update(occupations)
      .set(updateValues)
      .where(eq(occupations.id, id))
      .returning();

    return this.mapToEntity(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(occupations).where(eq(occupations.id, id));
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { vaccineCatalog } from '../../../../database/schema';

@Injectable()
export class ImmunizationCatalogService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async getVaccines() {
    const vaccines = await this.db.query.vaccineCatalog.findMany({
      where: eq(vaccineCatalog.isActive, true),
      orderBy: [asc(vaccineCatalog.sortOrder)],
    });

    return vaccines.map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      ageMilestone: v.ageMilestone,
      scheduleMonths: v.scheduleMonths,
      altGroup: v.altGroup,
      description: v.description,
      sortOrder: v.sortOrder,
    }));
  }
}

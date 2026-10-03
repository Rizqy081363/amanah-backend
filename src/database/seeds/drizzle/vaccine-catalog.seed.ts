import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DEFAULT_VACCINE_CATALOG } from '../../../modules/medical-records/domain/constants/immunization-catalog.constants';

export async function seedVaccineCatalog(client: PoolClient): Promise<void> {
  for (const item of DEFAULT_VACCINE_CATALOG) {
    await client.query(
      `INSERT INTO vaccine_catalog (
         id, code, name, age_milestone, schedule_months, alt_group, description, sort_order, is_active, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           age_milestone = EXCLUDED.age_milestone,
           schedule_months = EXCLUDED.schedule_months,
           alt_group = EXCLUDED.alt_group,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
      [
        randomUUID(),
        item.code,
        item.name,
        item.ageMilestone,
        item.scheduleMonths,
        item.altGroup || null,
        item.description,
        item.sortOrder,
      ],
    );
  }
}

/**
 * DB Atlas - Conventions Detection Enricher (P6)
 * Detects soft-delete, audit columns, tenant scoping, and PK conventions.
 */

import type { RelationFact, ConventionSummary } from '../core/types';

export class ConventionsEnricher {
  static enrich(relations: RelationFact[]): ConventionSummary {
    const tables = relations.filter((r) => r.kind === 'table' || r.kind === 'partitioned_table');

    const softDeleteCovered: string[] = [];
    const softDeleteMissing: string[] = [];

    const auditCovered: string[] = [];
    const tenantCovered: string[] = [];
    const pkTypes: Record<string, number> = {};

    for (const tbl of tables) {
      const colNames = tbl.columns.map((c) => c.name.toLowerCase());

      // 1. Soft delete convention
      if (colNames.includes('deleted_at') || colNames.includes('is_deleted')) {
        softDeleteCovered.push(tbl.qualifiedName);
      } else {
        softDeleteMissing.push(tbl.qualifiedName);
      }

      // 2. Audit timestamps
      if (colNames.includes('created_at') && colNames.includes('updated_at')) {
        auditCovered.push(tbl.qualifiedName);
      }

      // 3. Tenant / Clinic scoping
      if (colNames.includes('clinic_id')) {
        tenantCovered.push(tbl.qualifiedName);
      }

      // 4. Primary key types
      const pkCon = tbl.constraints.find((c) => c.type === 'PRIMARY KEY');
      if (pkCon && pkCon.columns.length === 1) {
        const pkCol = tbl.columns.find((c) => c.name === pkCon.columns[0]);
        const pkType = pkCol ? pkCol.dataType : 'unknown';
        pkTypes[pkType] = (pkTypes[pkType] || 0) + 1;
      } else if (pkCon && pkCon.columns.length > 1) {
        pkTypes['composite'] = (pkTypes['composite'] || 0) + 1;
      } else {
        pkTypes['none'] = (pkTypes['none'] || 0) + 1;
      }
    }

    return {
      softDelete: {
        columnName: 'deleted_at',
        coveredTables: softDeleteCovered.sort(),
        missingTables: softDeleteMissing.sort(),
      },
      auditTimestamps: {
        createdAtColumn: 'created_at',
        updatedAtColumn: 'updated_at',
        coveredTables: auditCovered.sort(),
      },
      tenantScoping: {
        columnName: 'clinic_id',
        coveredTables: tenantCovered.sort(),
      },
      primaryKeyTypes: pkTypes,
    };
  }
}

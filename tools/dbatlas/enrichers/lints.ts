/**
 * DB Atlas - Advisory Schema Lints Enricher (§7.9)
 * Detects unindexed foreign keys, missing primary keys, invalid indexes, and anomalies.
 */

import type { RelationFact, SchemaLint } from '../core/types';

export class LintsEnricher {
  static enrich(relations: RelationFact[]): SchemaLint[] {
    const lints: SchemaLint[] = [];

    for (const rel of relations) {
      if (rel.kind !== 'table') continue;

      // 1. Cek Primary Key
      const hasPk = rel.constraints.some((c) => c.type === 'PRIMARY KEY');
      if (!hasPk) {
        lints.push({
          code: 'LINT_NO_PK',
          severity: 'error',
          table: rel.qualifiedName,
          message: `Tabel '${rel.qualifiedName}' tidak memiliki Primary Key`,
          remediation: 'Tambahkan kolom Primary Key (misal: id uuid PRIMARY KEY DEFAULT gen_random_uuid())',
        });
      }

      // 2. Cek Foreign Key tanpa indeks pendukung pada tabel anak
      for (const con of rel.constraints) {
        if (con.type !== 'FOREIGN KEY') continue;

        const isIndexed = rel.indexes.some(
          (idx) =>
            idx.isValid &&
            con.columns.length <= idx.columns.length &&
            con.columns.every((c, i) => idx.columns[i] === c)
        );

        if (!isIndexed) {
          lints.push({
            code: 'LINT_UNINDEXED_FK',
            severity: 'warning',
            table: rel.qualifiedName,
            message: `Foreign Key '${con.name}' pada kolom (${con.columns.join(', ')}) tidak memiliki indeks pendukung`,
            remediation: `CREATE INDEX idx_${rel.name}_${con.columns.join('_')} ON ${rel.qualifiedName} (${con.columns.join(', ')});`,
          });
        }
      }

      // 3. Cek Indeks Tidak Valid (indisvalid = false)
      for (const idx of rel.indexes) {
        if (!idx.isValid) {
          lints.push({
            code: 'LINT_INVALID_INDEX',
            severity: 'error',
            table: rel.qualifiedName,
            message: `Indeks '${idx.name}' berstatus tidak valid (indisvalid = false)`,
            remediation: `Jalankan REINDEX INDEX CONCURRENTLY ${idx.name}; atau DROP dan bangun ulang`,
          });
        }
      }
    }

    return lints.sort((a, b) => a.table.localeCompare(b.table));
  }
}

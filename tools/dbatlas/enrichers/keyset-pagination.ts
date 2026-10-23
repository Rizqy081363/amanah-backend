/**
 * DB Atlas - Keyset Pagination Candidates Enricher (§7.7)
 * Finds unique ordered index paths usable for stable keyset pagination.
 */

import type { RelationFact, IndexFact } from '../core/types';

export interface KeysetCandidate {
  indexName: string;
  columns: string[];
  isDeterministic: boolean;
  orderClause: string;
  notes?: string;
}

export class KeysetPaginationEnricher {
  static findCandidatesForTable(table: RelationFact): KeysetCandidate[] {
    const candidates: KeysetCandidate[] = [];

    for (const idx of table.indexes) {
      if (!idx.isValid) continue;

      // 1. Primary key atau Unique index langsung bisa menjadi keyset deterministik
      if (idx.isPrimary || idx.isUnique) {
        candidates.push({
          indexName: idx.name,
          columns: idx.columns,
          isDeterministic: true,
          orderClause: `ORDER BY ${idx.columns.join(', ')} ASC`,
          notes: idx.isPrimary ? 'Primary Key (paling stabil untuk keyset pagination)' : 'Unique index',
        });
      } else if (idx.columns.length > 0) {
        // 2. Indeks non-unik: jika dikombinasikan dengan PK (misal (scheduled_at, id))
        const pkCon = table.constraints.find((c) => c.type === 'PRIMARY KEY');
        const pkCol = pkCon && pkCon.columns.length === 1 ? pkCon.columns[0] : null;

        if (pkCol && !idx.columns.includes(pkCol)) {
          candidates.push({
            indexName: idx.name,
            columns: [...idx.columns, pkCol],
            isDeterministic: true,
            orderClause: `ORDER BY ${idx.columns.join(', ')}, ${pkCol} ASC`,
            notes: `Membutuhkan tie-breaker primary key (${pkCol}) untuk menjamin stabilitas pagination`,
          });
        }
      }
    }

    return candidates;
  }
}

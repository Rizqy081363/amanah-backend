/**
 * DB Atlas - Declared Relationship Graph & Cardinality Enricher (P7)
 * Strictly derives edges from foreign key constraints.
 */

import type { RelationFact, DeclaredRelationship, CardinalityType } from '../core/types';

export class RelationshipGraphEnricher {
  static enrich(relations: RelationFact[], maxJunctionExtraCols = 3): DeclaredRelationship[] {
    const tableMap = new Map<string, RelationFact>();
    for (const r of relations) {
      tableMap.set(r.qualifiedName, r);
      tableMap.set(r.name, r);
    }

    const declared: DeclaredRelationship[] = [];

    for (const rel of relations) {
      for (const con of rel.constraints) {
        if (con.type !== 'FOREIGN KEY' || !con.foreignTable) continue;

        const targetRel = tableMap.get(con.foreignTable);
        const fromCols = con.columns;
        const toCols = con.foreignColumns || ['id'];

        // Cek nullability kolom anak
        const isRequired = fromCols.every((colName) => {
          const cFact = rel.columns.find((c) => c.name === colName);
          return cFact ? !cFact.isNullable : false;
        });

        // 1. Cek Hierarchy (self-reference)
        let cardinality: CardinalityType = 'one-to-many';
        if (con.foreignTable === rel.qualifiedName || con.foreignTable === rel.name) {
          cardinality = 'hierarchy';
        } else {
          // 2. Cek One-to-One: apakah fromCols tercakup penuh oleh PK atau Unique constraint?
          const isCoveredByUnique = rel.constraints.some(
            (c) =>
              (c.type === 'PRIMARY KEY' || c.type === 'UNIQUE') &&
              c.columns.length === fromCols.length &&
              c.columns.every((col) => fromCols.includes(col))
          );
          if (isCoveredByUnique) {
            cardinality = 'one-to-one';
          }
        }

        declared.push({
          provenance: 'declared',
          name: con.name,
          fromTable: rel.qualifiedName,
          fromColumns: fromCols,
          toTable: targetRel ? targetRel.qualifiedName : con.foreignTable,
          toColumns: toCols,
          cardinality,
          isRequired,
          onDelete: con.onDelete || 'NO ACTION',
          onUpdate: con.onUpdate || 'NO ACTION',
        });
      }
    }

    return declared;
  }
}

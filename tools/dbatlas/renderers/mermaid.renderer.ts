/**
 * DB Atlas - Mermaid ERD Renderer
 * Generates valid, readable Mermaid erDiagram syntax for entire schema and per-module subsets.
 */

import type { RelationFact, DeclaredRelationship } from '../core/types';

export class MermaidRenderer {
  /**
   * Menghasilkan Mermaid erDiagram string.
   */
  static renderErDiagram(relations: RelationFact[], declaredRels: DeclaredRelationship[]): string {
    const lines: string[] = ['erDiagram'];
    const tableNames = new Set(relations.map((r) => r.name));

    // 1. Definisikan entitas dan atribut utamanya
    for (const rel of relations) {
      lines.push(`    ${rel.name} {`);
      for (const col of rel.columns.slice(0, 8)) { // batasi 8 kolom per entitas agar diagram tidak sesak
        const isPk = rel.constraints.some((c) => c.type === 'PRIMARY KEY' && c.columns.includes(col.name));
        const isFk = rel.constraints.some((c) => c.type === 'FOREIGN KEY' && c.columns.includes(col.name));
        const keyTag = isPk ? 'PK' : isFk ? 'FK' : '';
        const cleanType = col.dataType.replace(/[^a-zA-Z0-9_]/g, '_');
        lines.push(`        ${cleanType} ${col.name} ${keyTag}`.trimEnd());
      }
      lines.push('    }');
    }

    // 2. Definisikan relasi/edge antar entitas
    for (const rel of declaredRels) {
      const fromName = rel.fromTable.split('.').pop() || rel.fromTable;
      const toName = rel.toTable.split('.').pop() || rel.toTable;

      if (!tableNames.has(fromName) || !tableNames.has(toName)) continue;

      // Syntax Mermaid ERD:
      // ||--o{ : One to Many
      // ||--|| : One to One
      const cardSymbol = rel.cardinality === 'one-to-one' ? '||--||' : '||--o{';
      lines.push(`    ${toName} ${cardSymbol} ${fromName} : "${rel.fromColumns.join('_')}"`);
    }

    return lines.join('\n');
  }

  /**
   * Menghasilkan peta diagram per modul domain.
   */
  static renderModuleDiagrams(
    relations: RelationFact[],
    declaredRels: DeclaredRelationship[],
    modules: { name: string; tables: string[] }[]
  ): Map<string, string> {
    const diagrams = new Map<string, string>();

    for (const mod of modules) {
      const moduleTableSet = new Set(mod.tables);
      const modRelations = relations.filter((r) => moduleTableSet.has(r.qualifiedName) || moduleTableSet.has(r.name));
      const modRels = declaredRels.filter(
        (r) => moduleTableSet.has(r.fromTable) && moduleTableSet.has(r.toTable)
      );

      const mmd = this.renderErDiagram(modRelations, modRels);
      diagrams.set(mod.name, mmd);
    }

    return diagrams;
  }
}

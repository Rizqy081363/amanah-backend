/**
 * DB Atlas - Layer 1: Table Card Renderer (§8.3 Normative Shape)
 * Produces structured, agent-friendly Markdown cards for individual tables.
 */

import type { RelationFact, DeclaredRelationship, EnumFact } from '../core/types';
import { KeysetPaginationEnricher } from '../enrichers/keyset-pagination';

export class TableCardRenderer {
  static render(
    rel: RelationFact,
    declaredRels: DeclaredRelationship[],
    enums: EnumFact[]
  ): string {
    const lines: string[] = [];
    const hasPhi = rel.columns.some((c) => c.sensitivity === 'phi');
    const hasPii = rel.columns.some((c) => c.sensitivity === 'pii');
    const sensitivityLabel = hasPhi
      ? 'contains PHI (Medical/Clinical)'
      : hasPii
      ? 'contains PII (Demographic)'
      : 'standard';

    lines.push(`# ${rel.qualifiedName}`);
    lines.push(`> ${rel.kind} · module: ${rel.module || 'general_core'} · sensitivity: ${sensitivityLabel} · rows ≈ see telemetry`);
    lines.push('');
    lines.push(`**Purpose:** ${rel.comment || '—'}`);
    lines.push('');

    // 1. Kolom
    lines.push('## Columns');
    lines.push('| # | column | type | null | default | notes |');
    lines.push('|---|--------|------|:---:|---------|-------|');

    const enumMap = new Map(enums.map((e) => [e.name, e]));

    for (const col of rel.columns) {
      const notes: string[] = [];

      // PK check
      const isPk = rel.constraints.some(
        (c) => c.type === 'PRIMARY KEY' && c.columns.includes(col.name)
      );
      if (isPk) notes.push('PK');

      // FK check
      const fk = rel.constraints.find(
        (c) => c.type === 'FOREIGN KEY' && c.columns.includes(col.name)
      );
      if (fk && fk.foreignTable) {
        notes.push(`FK → ${fk.foreignTable}(${(fk.foreignColumns || ['id']).join(', ')})`);
      }

      // Enum check
      if (col.enumType && enumMap.has(col.enumType)) {
        const eObj = enumMap.get(col.enumType)!;
        notes.push(`enum: ${eObj.labels.join(' < ')}`);
      }

      // Sensitivity note
      if (col.sensitivity === 'phi' || col.sensitivity === 'pii') {
        notes.push(`⚠️ ${col.sensitivity.toUpperCase()} (${col.sensitivityReason || 'sensitive'})`);
      }

      const nullStr = col.isNullable ? 'yes' : 'no';
      const defStr = col.defaultValue ? `\`${col.defaultValue}\`` : '';
      const notesStr = notes.join(' · ') || '';

      lines.push(`| ${col.ordinal} | \`${col.name}\` | \`${col.dataType}\` | ${nullStr} | ${defStr} | ${notesStr} |`);
    }
    lines.push('');

    // 2. Keys & Constraints
    lines.push('## Keys & constraints');
    if (rel.constraints.length === 0) {
      lines.push('- Tidak ada constraint eksplisit terdaftar.');
    } else {
      for (const con of rel.constraints) {
        if (con.type === 'FOREIGN KEY') {
          lines.push(`- FK \`${con.columns.join(', ')}\` → ${con.foreignTable}(${(con.foreignColumns || ['id']).join(', ')}) ON DELETE ${con.onDelete || 'NO ACTION'} · ${con.definition}`);
        } else {
          lines.push(`- ${con.type} (\`${con.columns.join(', ')}\`) · \`${con.definition}\``);
        }
      }
    }
    lines.push('');

    // 3. Indexes
    lines.push('## Indexes');
    if (rel.indexes.length === 0) {
      lines.push('- Tidak ada indeks terdaftar.');
    } else {
      for (const idx of rel.indexes) {
        const uniqueTag = idx.isUnique ? 'UNIQUE ' : '';
        const primaryTag = idx.isPrimary ? 'PRIMARY ' : '';
        const validTag = !idx.isValid ? ' ⚠️ INVALID' : '';

        // Cek apakah indeks mendukung FK
        const supportedFk = rel.constraints.find(
          (c) =>
            c.type === 'FOREIGN KEY' &&
            c.columns.every((col, i) => idx.columns[i] === col)
        );
        const fkTag = supportedFk ? ` ← supports FK \`${supportedFk.name}\`` : '';

        lines.push(`- \`${idx.name}\` ${uniqueTag}${primaryTag}(\`${idx.columns.join(', ')}\`)${validTag}${fkTag}`);
      }
    }
    lines.push('');

    // 4. Relationships (Outgoing vs Incoming)
    lines.push('## Relationships');
    const outgoing = declaredRels.filter((r) => r.fromTable === rel.qualifiedName);
    const incoming = declaredRels.filter((r) => r.toTable === rel.qualifiedName);

    lines.push('**Outgoing (this → parent):**');
    if (outgoing.length === 0) {
      lines.push('- Tidak ada relasi outgoing.');
    } else {
      for (const out of outgoing) {
        lines.push(`- ${out.toTable} (FK \`${out.fromColumns.join(', ')}\` → ${out.toColumns.join(', ')}) · ${out.cardinality} · ${out.isRequired ? 'required' : 'optional'}`);
      }
    }

    lines.push('**Incoming (child → this):**');
    if (incoming.length === 0) {
      lines.push('- Tidak ada relasi incoming.');
    } else {
      for (const inc of incoming) {
        const fanOutWarning = inc.cardinality === 'one-to-many' ? ' ⚠️ (joining from here FANS OUT)' : '';
        lines.push(`- ${inc.fromTable}.${inc.fromColumns.join(', ')} (declared, ${inc.cardinality})${fanOutWarning}`);
      }
    }
    lines.push('');

    // 5. Side Effects (Triggers)
    lines.push('## Side effects');
    if (rel.triggers.length === 0) {
      lines.push('- Tidak ada trigger aktif.');
    } else {
      for (const trg of rel.triggers) {
        lines.push(`- Trigger \`${trg.name}\`: ${trg.timing} ${trg.events.join('/')} → \`${trg.functionName}()\``);
      }
    }
    lines.push('');

    // 6. Query Rules (Mandatory for Agents)
    lines.push('## Query rules (derived, mandatory)');
    const colNames = rel.columns.map((c) => c.name.toLowerCase());
    if (colNames.includes('deleted_at')) {
      lines.push('- **Filter Soft-Delete**: Selalu sertakan `deleted_at IS NULL` (konvensi soft-delete berlaku pada tabel ini).');
    }
    if (hasPhi) {
      lines.push('- **Proteksi PHI**: Dilarang keras melakukan `SELECT *`! Pilih kolom spesifik non-sensitif untuk menghindari kebocoran data medis.');
    }

    // Keyset pagination candidates
    const keysetCandidates = KeysetPaginationEnricher.findCandidatesForTable(rel);
    if (keysetCandidates.length > 0) {
      const best = keysetCandidates[0];
      lines.push(`- **Keyset Pagination**: Gunakan \`${best.orderClause}\` melalui indeks \`${best.indexName}\`.`);
    }

    return lines.join('\n');
  }
}

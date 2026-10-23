/**
 * DB Atlas - Layer 0: INDEX.md Renderer (P6)
 * Concise schema overview designed to fit within a strict token budget (<3,000 tokens).
 */

import type { CanonicalAtlasModel } from '../core/types';

export class IndexMdRenderer {
  static render(model: CanonicalAtlasModel): string {
    const lines: string[] = [];

    lines.push('# DB Atlas — Schema Index (Layer 0)');
    lines.push('');
    lines.push(`> **Database**: \`${model.target}\` · **Schema Version**: \`${model.schemaVersion}\` · **Total Tabel/View**: ${model.relations.length}`);
    lines.push('> Konsultasikan peta ini sebelum menulis kueri. Jangan pernah melakukan eksplorasi dengan kueri `SELECT *` ad-hoc.');
    lines.push('');
    lines.push('---');
    lines.push('');

    // 1. Modul Domain
    lines.push('## 1. Modul Domain');
    lines.push('');
    for (const mod of model.modules) {
      lines.push(`- **\`${mod.name}\`** (${mod.tables.length} tabel) — [Diagram Mermaid](modules/${mod.name}.mmd)`);
    }
    lines.push('');

    // 2. Ringkasan Konvensi Global
    lines.push('## 2. Konvensi Arsitektur Terdeteksi');
    lines.push('');
    const conv = model.conventions;
    lines.push(`- **Soft Delete (\`${conv.softDelete.columnName}\`)**: Ditemukan pada ${conv.softDelete.coveredTables.length} dari ${conv.softDelete.coveredTables.length + conv.softDelete.missingTables.length} tabel.`);
    if (conv.softDelete.missingTables.length > 0) {
      lines.push(`  *Tabel tanpa soft-delete*: ${conv.softDelete.missingTables.slice(0, 10).join(', ')}${conv.softDelete.missingTables.length > 10 ? ', ...' : ''}`);
    }
    lines.push(`- **Audit Timestamps (\`${conv.auditTimestamps.createdAtColumn}\`, \`${conv.auditTimestamps.updatedAtColumn}\`)**: Ditemukan pada ${conv.auditTimestamps.coveredTables.length} tabel.`);
    lines.push(`- **Tenant Scoping (\`${conv.tenantScoping.columnName}\`)**: Ditemukan pada ${conv.tenantScoping.coveredTables.length} tabel.`);
    lines.push('');

    // 3. Inventaris Tabel & Kartu (Layer 1)
    lines.push('## 3. Indeks Tabel & Tautan Kartu Detail');
    lines.push('');
    lines.push('| Tabel | Jenis | Modul | Kolom | PHI/PII | Catatan / Tujuan |');
    lines.push('| :--- | :--- | :--- | :---: | :---: | :--- |');

    for (const rel of model.relations) {
      const hasPhi = rel.columns.some((c) => c.sensitivity === 'phi');
      const hasPii = rel.columns.some((c) => c.sensitivity === 'pii');
      const sensTag = hasPhi ? '🚨 PHI' : hasPii ? '⚠️ PII' : '—';
      const purpose = rel.comment || '—';
      const cardLink = `[${rel.qualifiedName}](tables/${rel.qualifiedName}.md)`;

      lines.push(`| ${cardLink} | \`${rel.kind}\` | \`${rel.module || 'core'}\` | ${rel.columns.length} | ${sensTag} | ${purpose} |`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 4. Referensi Lengkap');
    lines.push('- [Protokol Agen (PROTOCOL.md)](PROTOCOL.md) — Aturan wajib kueri AI');
    lines.push('- [Katalog Enum (enums.md)](enums.md) — 42 tipe enum kanonik');
    lines.push('- [Diagram ERD Global (relationships.mmd)](relationships.mmd)');
    lines.push('- [Relasi Inferensi & Kandidat FK (inferred.md)](inferred.md)');
    lines.push('- [Temuan Linting Skema (lints.md)](lints.md)');

    return lines.join('\n');
  }
}

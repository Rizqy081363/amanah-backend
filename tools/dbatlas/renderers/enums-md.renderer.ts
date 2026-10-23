/**
 * DB Atlas - enums.md Renderer
 * Catalog of all canonical enum types, their ordered labels, and reverse column usage.
 */

import type { EnumFact } from '../core/types';

export class EnumsMdRenderer {
  static render(enums: EnumFact[]): string {
    const lines: string[] = [];

    lines.push('# DB Atlas — Canonical Enums Catalog');
    lines.push('');
    lines.push(`> Total Tipe Enum Terdaftar: **${enums.length}**`);
    lines.push('> Enum adalah Single Source of Truth (SSOT) kategori bisnis. Dilarang keras mengarang string bebas di luar label terdaftar.');
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const e of enums) {
      lines.push(`## \`${e.name}\` (${e.schema})`);
      lines.push('');
      lines.push('**Nilai Kanonik Berurutan (*enumsortorder*):**');
      lines.push('```text');
      lines.push(e.labels.join(' < '));
      lines.push('```');
      lines.push('');

      lines.push('**Digunakan oleh Kolom:**');
      if (e.usedByColumns.length === 0) {
        lines.push('- *Belum ada kolom yang mereferensikan enum ini.*');
      } else {
        for (const u of e.usedByColumns) {
          lines.push(`- \`${u.table}.${u.column}\``);
        }
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }
}

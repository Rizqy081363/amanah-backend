/**
 * DB Atlas - lints.md Renderer
 * Reports advisory structural lints (unindexed FKs, missing PKs, invalid indexes).
 */

import type { SchemaLint } from '../core/types';

export class LintsMdRenderer {
  static render(lints: SchemaLint[]): string {
    const lines: string[] = [];

    lines.push('# DB Atlas — Schema Health Lints (Advisory)');
    lines.push('');
    lines.push(`> Total Temuan: **${lints.length}**`);
    lines.push('> Lints bersifat penasehat (advisory) dan dipisahkan dari fakta skema utama.');
    lines.push('');
    lines.push('---');
    lines.push('');

    if (lints.length === 0) {
      lines.push('🎉 Luar biasa! Seluruh tabel memenuhi standar indeks, Primary Key, dan integritas skema.');
      return lines.join('\n');
    }

    const errors = lints.filter((l) => l.severity === 'error');
    const warnings = lints.filter((l) => l.severity === 'warning');

    if (errors.length > 0) {
      lines.push(`## 🚨 Isu Kritis (${errors.length})`);
      lines.push('');
      for (const err of errors) {
        lines.push(`### \`[${err.code}]\` ${err.table}`);
        lines.push(`- **Pesan**: ${err.message}`);
        lines.push(`- **Remediasi**: \`${err.remediation}\``);
        lines.push('');
      }
    }

    if (warnings.length > 0) {
      lines.push(`## ⚠️ Peringatan Kinerja & Indeks (${warnings.length})`);
      lines.push('');
      lines.push('| Tabel | Isu | Saran Solusi SQL |');
      lines.push('| :--- | :--- | :--- |');
      for (const w of warnings) {
        lines.push(`| \`${w.table}\` | ${w.message} | \`${w.remediation}\` |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

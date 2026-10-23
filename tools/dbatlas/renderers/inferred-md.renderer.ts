/**
 * DB Atlas - inferred.md Renderer
 * Reports heuristic candidate relationships and missing foreign keys (Advisory).
 */

import type { InferredRelationship } from '../core/types';

export class InferredMdRenderer {
  static render(inferred: InferredRelationship[]): string {
    const lines: string[] = [];

    lines.push('# DB Atlas — Inferred Relationships & Missing FK Candidates');
    lines.push('');
    lines.push('> ⚠️ **Peringatan P7 (Fakta Deklaratif vs Inferensi)**:');
    lines.push('> Relasi di bawah ini disimpulkan melalui heuristik konvensi penamaan (`*_id`) dan kecocokan tipe data.');
    lines.push('> **DILARANG** menganggap relasi ini sebagai garansi database atau menggunakannya pada jalur penulisan data (*write path*) sebelum dikonfirmasi oleh tim rekayasa.');
    lines.push('');
    lines.push('---');
    lines.push('');

    if (inferred.length === 0) {
      lines.push('Selamat! Tidak ditemukan kolom orphan `*_id` tanpa foreign key deklaratif.');
      return lines.join('\n');
    }

    lines.push('## Kandidat Foreign Key yang Hilang');
    lines.push('');
    lines.push('| Tabel Sumber | Kolom Sumber | Tabel Target | Kolom Target | Keyakinan | Alasan & Analisis |');
    lines.push('| :--- | :--- | :--- | :--- | :---: | :--- |');

    for (const inf of inferred) {
      const confTag = `${Math.round(inf.confidence * 100)}%`;
      lines.push(`| \`${inf.fromTable}\` | \`${inf.fromColumn}\` | \`${inf.toTable}\` | \`${inf.toColumn}\` | **${confTag}** | ${inf.reason} |`);
    }

    lines.push('');
    lines.push('---');
    lines.push('### Saran Remediasi:');
    lines.push('Jika relasi di atas memang valid secara bisnis, tambahkan Foreign Key constraint deklaratif melalui Drizzle migration:');
    lines.push('```sql');
    for (const inf of inferred.filter((i) => !i.isPolymorphic).slice(0, 5)) {
      lines.push(`ALTER TABLE ${inf.fromTable} ADD CONSTRAINT fk_${inf.fromTable.split('.').pop()}_${inf.fromColumn} FOREIGN KEY (${inf.fromColumn}) REFERENCES ${inf.toTable}(id);`);
    }
    lines.push('```');

    return lines.join('\n');
  }
}

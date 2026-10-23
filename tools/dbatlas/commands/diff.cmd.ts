/**
 * DB Atlas - Diff Command (Offline Schema Diff)
 * Compares two atlas.json files and flags potentially breaking changes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalAtlasModel } from '../core/types';

export function runDiffCommand(
  pathA: string,
  pathB: string,
  workspaceRoot: string
): number {
  if (!pathA || !pathB) {
    console.error('[dbatlas diff] Kesalahan: Dua berkas atlas.json wajib disertakan. Contoh: `dbatlas diff ./db-atlas/atlas.json ./backup-atlas/atlas.json`');
    return 1;
  }

  const fileA = resolve(workspaceRoot, pathA);
  const fileB = resolve(workspaceRoot, pathB);

  if (!existsSync(fileA) || !existsSync(fileB)) {
    console.error(`[dbatlas diff] Salah satu berkas tidak ditemukan: ${fileA} atau ${fileB}`);
    return 1;
  }

  const modelA: CanonicalAtlasModel = JSON.parse(readFileSync(fileA, 'utf8'));
  const modelB: CanonicalAtlasModel = JSON.parse(readFileSync(fileB, 'utf8'));

  console.log('='.repeat(80));
  console.log(` DB ATLAS — STRUCTURAL SCHEMA DIFF`);
  console.log(` A (Base)   : ${pathA}`);
  console.log(` B (Target) : ${pathB}`);
  console.log('='.repeat(80));

  const tablesA = new Map(modelA.relations.map((r) => [r.qualifiedName, r]));
  const tablesB = new Map(modelB.relations.map((r) => [r.qualifiedName, r]));

  let diffCount = 0;
  let breakingCount = 0;

  // 1. Cek tabel yang dihapus (BREAKING)
  for (const [name] of tablesA) {
    if (!tablesB.has(name)) {
      diffCount++;
      breakingCount++;
      console.log(`🚨 [BREAKING] Tabel dihapus: ${name}`);
    }
  }

  // 2. Cek tabel yang ditambahkan
  for (const [name] of tablesB) {
    if (!tablesA.has(name)) {
      diffCount++;
      console.log(`+ [ADDED] Tabel baru: ${name}`);
    }
  }

  // 3. Cek modifikasi kolom pada tabel bersama
  for (const [name, relA] of tablesA) {
    const relB = tablesB.get(name);
    if (!relB) continue;

    const colsA = new Map(relA.columns.map((c) => [c.name, c]));
    const colsB = new Map(relB.columns.map((c) => [c.name, c]));

    // Kolom dihapus
    for (const [cName] of colsA) {
      if (!colsB.has(cName)) {
        diffCount++;
        breakingCount++;
        console.log(`🚨 [BREAKING] Kolom '${cName}' dihapus dari tabel '${name}'`);
      }
    }

    // Kolom ditambah
    for (const [cName, cB] of colsB) {
      if (!colsA.has(cName)) {
        diffCount++;
        if (!cB.isNullable && !cB.defaultValue) {
          breakingCount++;
          console.log(`🚨 [BREAKING] Kolom '${cName}' ditambahkan ke '${name}' dengan NOT NULL tanpa DEFAULT`);
        } else {
          console.log(`+ Kolom baru '${cName}' (${cB.dataType}) pada tabel '${name}'`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(` Rangkuman Perbedaan: ${diffCount} perubahan (${breakingCount} berpotensi merusak/breaking)`);
  console.log('='.repeat(80));

  return breakingCount > 0 ? 2 : 0;
}

/**
 * DB Atlas - Check Command (Drift Gate §9)
 * Compares live database factsHash against committed FINGERPRINT.json.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseTransport } from '../transport/transport.interface';
import type { DbAtlasConfig } from '../config/config.interface';
import { CatalogExtractorService } from '../extractors/catalog-extractor.service';
import { DbAtlasFingerprinter, type FingerprintResult } from '../core/fingerprinter';

export async function runCheckCommand(
  transport: DatabaseTransport,
  config: DbAtlasConfig,
  workspaceRoot: string
): Promise<number> {
  const mapDir = resolve(workspaceRoot, config.output.dir || 'db-atlas');
  const fingerprintPath = resolve(mapDir, 'FINGERPRINT.json');

  if (!existsSync(fingerprintPath)) {
    console.error(`[dbatlas check] Peta belum digenerate atau FINGERPRINT.json tidak ditemukan di: ${fingerprintPath}`);
    console.error('Silakan jalankan `bun run db:atlas` untuk membuat peta awal.');
    return 5;
  }

  let committedFingerprint: FingerprintResult;
  try {
    committedFingerprint = JSON.parse(readFileSync(fingerprintPath, 'utf8'));
  } catch (err: any) {
    console.error(`[dbatlas check] Gagal membaca FINGERPRINT.json: ${err.message}`);
    return 5;
  }

  // 1. Ekstraksi cepat katalog live
  let liveRawFacts;
  try {
    const extractorService = new CatalogExtractorService(transport, config.schemas);
    liveRawFacts = await extractorService.extractAll();
  } catch (err: any) {
    console.error(`[dbatlas check] Gagal mengekstraksi katalog database live: ${err.message}`);
    return 3;
  }

  // 2. Hitung live factsHash
  const liveFactsHash = DbAtlasFingerprinter.computeFactsHash(
    liveRawFacts.relations,
    liveRawFacts.enums
  );

  console.log('='.repeat(80));
  console.log(' DB ATLAS — SCHEMA DRIFT VERIFICATION (CHECK)');
  console.log('='.repeat(80));
  console.log(` Committed Facts Hash : ${committedFingerprint.factsHash}`);
  console.log(` Live Facts Hash      : ${liveFactsHash}`);
  console.log('='.repeat(80));

  if (committedFingerprint.factsHash === liveFactsHash) {
    console.log('\n[PASS] PETA SEGAR (FRESH): Struktur database live cocok 100% dengan peta.');
    return 0;
  }

  // 3. Deteksi perbedaan struktural ringkas
  console.warn('\n[DRIFT DETECTED] Skema database live telah berubah sejak peta terakhir digenerate!');
  console.warn('Terjadi migrasi DDL atau modifikasi skema yang belum direfleksikan ke db-atlas/.');
  console.warn('\nLangkah Remediasi Wajib:');
  console.warn('  1. Jalankan `bun run db:atlas` untuk memperbarui peta.');
  console.warn('  2. Commit perubahan folder `db-atlas/` bersamaan dengan commit migrasi.');

  return 2;
}

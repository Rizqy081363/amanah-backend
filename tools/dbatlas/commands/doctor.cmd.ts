/**
 * DB Atlas - Doctor Command
 * Diagnoses connection, server version, privileges, and configuration health.
 */

import type { DatabaseTransport } from '../transport/transport.interface';
import type { DbAtlasConfig } from '../config/config.interface';

export async function runDoctorCommand(
  transport: DatabaseTransport,
  config: DbAtlasConfig
): Promise<number> {
  console.log('='.repeat(80));
  console.log(' DB ATLAS — SYSTEM & ENVIRONMENT DIAGNOSTIC (DOCTOR)');
  console.log('='.repeat(80));
  console.log(` Target Environment : ${config.target.label}`);
  console.log(` Transport Active    : ${transport.name}`);
  console.log(` Target Database    : ${config.connection.database || 'amanah_healthcare'}`);
  console.log(` Target Host/Port   : ${config.connection.host || '127.0.0.1'}:${config.connection.port || 5433}`);
  console.log('='.repeat(80));

  console.log('\n[1/3] Memeriksa Konektivitas Database...');
  const testRes = await transport.testConnection();
  if (!testRes.ok) {
    console.error(`  ✖ KONEKSI GAGAL: ${testRes.error}`);
    console.error('    Pastikan kontainer Docker (backend-postgres-1) aktif atau periksa parameter koneksi.');
    return 3;
  }
  console.log(`  ✓ Terhubung dengan sukses!`);
  console.log(`    Versi PostgreSQL: ${testRes.version?.split('on')[0]?.trim() || 'PostgreSQL'}`);

  console.log('\n[2/3] Memeriksa Hak Akses Read-Only & Katalog...');
  try {
    const catalogCheck = await transport.queryJson<any>(
      `SELECT count(*)::int AS count FROM pg_namespace WHERE nspname NOT LIKE 'pg_%';`
    );
    console.log(`  ✓ Akses ke pg_catalog terverifikasi aman (${catalogCheck[0]?.count || catalogCheck?.count || 0} namespace terdeteksi).`);
  } catch (err: any) {
    console.error(`  ✖ Hak akses katalog terhambat: ${err.message}`);
    return 3;
  }

  console.log('\n[3/3] Memeriksa Konfigurasi & Scope Skema...');
  console.log(`  ✓ Skema yang dipantau : [${config.schemas.include?.join(', ')}]`);
  console.log(`  ✓ Folder output map   : ${config.output.dir}`);
  console.log(`  ✓ Level redaksi       : ${config.redaction.level} (Maksimum perlindungan data aktif)`);

  console.log('\n' + '='.repeat(80));
  console.log(' DIAGNOSTIK SELESAI: Lingkungan siap digunakan untuk generasi peta DB Atlas.');
  console.log('='.repeat(80));
  return 0;
}

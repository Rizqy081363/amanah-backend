#!/usr/bin/env bun
import { createDbPool } from './purge/db-connection';
import { NikSecurityService } from '../../src/common/security/nik/nik-security.service';

async function main() {
  const pool = createDbPool();
  const configMock = {
    get: (key: string) => {
      if (key === 'AUTH_JWT_SECRET') return process.env.AUTH_JWT_SECRET || '63d7c01d452ba6c99d5bcea1dccb2d4a6a8632d837b1cf38f513ab40ed89643b';
      if (key === 'NIK_BLIND_INDEX_PEPPER') return process.env.NIK_BLIND_INDEX_PEPPER;
      if (key === 'NIK_ENCRYPTION_KEY') return process.env.NIK_ENCRYPTION_KEY;
      return undefined;
    },
  };

  const nikSecurity = new NikSecurityService(configMock as any);

  console.log('[BACKFILL] Fetching patient profiles with plaintext NIK...');
  const res = await pool.query(
    'SELECT id, full_name, national_id_hash, national_id_encrypted FROM patient_profiles WHERE national_id_hash IS NOT NULL;'
  );

  console.log(`[BACKFILL] Found ${res.rows.length} patient records.`);
  let updatedCount = 0;

  for (const row of res.rows) {
    const raw = row.national_id_hash || row.national_id_encrypted;
    // Only backfill if it looks like legacy plaintext (16 digits)
    if (/^\d{16}$/.test(raw)) {
      const secured = nikSecurity.secure(raw);
      if (secured) {
        await pool.query(
          'UPDATE patient_profiles SET national_id_hash = $1, national_id_encrypted = $2 WHERE id = $3;',
          [secured.blindIndex, secured.encrypted, row.id]
        );
        console.log(`[BACKFILL] Patient ${row.id} (${row.full_name}): Migrated to HMAC blind index & AES-GCM ciphertext.`);
        updatedCount++;
      }
    } else {
      console.log(`[BACKFILL] Patient ${row.id} (${row.full_name}): Already secured or non-plaintext. Skipping.`);
    }
  }

  console.log(`[BACKFILL] Finished. ${updatedCount} records successfully encrypted.`);
  await pool.end();
}

main().catch((err) => {
  console.error('[BACKFILL ERROR]', err);
  process.exit(1);
});

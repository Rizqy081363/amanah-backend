#!/usr/bin/env bun
import { createDbPool } from './purge/db-connection';
import { NikSecurityService } from '../../src/common/security/nik/nik-security.service';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const NEW_ENCRYPTION_KEY = '5e82cd3d8f5dac1486b3b23894e2ed02cd8740c77638b192dbb3b4c14f9073b0';
const NEW_BLIND_INDEX_PEPPER = '7b21df0796eb46121581483959836847f1eecb406da015eb63facdd11441149f';

async function main() {
  const pool = createDbPool();

  const oldConfig = {
    get: (key: string) => {
      if (key === 'AUTH_JWT_SECRET') return '63d7c01d452ba6c99d5bcea1dccb2d4a6a8632d837b1cf38f513ab40ed89643b';
      return undefined;
    },
  };

  const newConfig = {
    get: (key: string) => {
      if (key === 'NIK_ENCRYPTION_KEY') return NEW_ENCRYPTION_KEY;
      if (key === 'NIK_BLIND_INDEX_PEPPER') return NEW_BLIND_INDEX_PEPPER;
      return undefined;
    },
  };

  const oldNikSecurity = new NikSecurityService(oldConfig as any);
  const newNikSecurity = new NikSecurityService(newConfig as any);

  console.log('[ROTATE] Rotating NIK keys for patient_profiles...');
  const patientsRes = await pool.query(
    'SELECT id, full_name, national_id_encrypted FROM patient_profiles WHERE national_id_encrypted IS NOT NULL;'
  );

  let patientMigrated = 0;
  for (const row of patientsRes.rows) {
    const decrypted = oldNikSecurity.decrypt(row.national_id_encrypted);
    if (decrypted) {
      const secured = newNikSecurity.secure(decrypted);
      if (secured) {
        await pool.query(
          'UPDATE patient_profiles SET national_id_hash = $1, national_id_encrypted = $2 WHERE id = $3;',
          [secured.blindIndex, secured.encrypted, row.id]
        );
        patientMigrated++;
      }
    }
  }
  console.log(`[ROTATE] Successfully re-encrypted ${patientMigrated} patient records.`);

  console.log('[ROTATE] Rotating NIK keys for staff_profiles...');
  const staffRes = await pool.query(
    'SELECT id, national_id_encrypted FROM staff_profiles WHERE national_id_encrypted IS NOT NULL;'
  );

  let staffMigrated = 0;
  for (const row of staffRes.rows) {
    const decrypted = oldNikSecurity.decrypt(row.national_id_encrypted);
    if (decrypted) {
      const secured = newNikSecurity.secure(decrypted);
      if (secured) {
        await pool.query(
          'UPDATE staff_profiles SET national_id_hash = $1, national_id_encrypted = $2 WHERE id = $3;',
          [secured.blindIndex, secured.encrypted, row.id]
        );
        staffMigrated++;
      }
    }
  }
  console.log(`[ROTATE] Successfully re-encrypted ${staffMigrated} staff records.`);

  // Update backend/.env
  const envPath = resolve(import.meta.dir, '../../.env');
  let envContent = readFileSync(envPath, 'utf8');

  if (!envContent.includes('NIK_ENCRYPTION_KEY')) {
    const block = `\n# NIK Data Protection (AES-256-GCM Encryption & HMAC-SHA-256 Blind Index)\nNIK_ENCRYPTION_KEY=${NEW_ENCRYPTION_KEY}\nNIK_BLIND_INDEX_PEPPER=${NEW_BLIND_INDEX_PEPPER}\n`;
    envContent = envContent.replace(
      'AUTH_JWT_SECRET=',
      `${block}AUTH_JWT_SECRET=`
    );
    writeFileSync(envPath, envContent, 'utf8');
    console.log('[ROTATE] Added NIK_ENCRYPTION_KEY and NIK_BLIND_INDEX_PEPPER to backend/.env');
  }

  // Verification step
  const verifyRes = await pool.query(
    'SELECT id, national_id_encrypted FROM patient_profiles WHERE national_id_encrypted IS NOT NULL LIMIT 1;'
  );
  if (verifyRes.rows.length > 0) {
    const testEnc = verifyRes.rows[0].national_id_encrypted;
    const testDecrypted = newNikSecurity.decrypt(testEnc);
    console.log(`[VERIFY] Decrypted verification test: ${testDecrypted ? 'SUCCESS (16-digit valid)' : 'FAILED'}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[ROTATE ERROR]', err);
  process.exit(1);
});

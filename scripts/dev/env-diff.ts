#!/usr/bin/env bun
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Enterprise Environment Diff Verifier (bun run env:diff)
 * Strictly adheres to:
 * - NEVER prints or reveals secret values, fragments, or hashes.
 * - Compares local .env against the live running container environment.
 * - Flags whitelisted network overrides as EXPECTED_DIFF.
 */

const backendRoot = resolve(import.meta.dir, '../..');
const envPath = resolve(backendRoot, '.env');
const containerName = 'backend-api-1';

console.log('================================================================================');
console.log(` Amanah Healthcare — Environment Diff Inspector (${containerName} vs .env)`);
console.log('================================================================================');

if (!existsSync(envPath)) {
  console.error(`[ERROR] File .env lokal tidak ditemukan di: ${envPath}`);
  process.exit(1);
}

// Check container status
let dockerEnvOutput = '';
try {
  dockerEnvOutput = execSync(`docker exec ${containerName} env`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
} catch {
  console.error(`❌ Container "${containerName}" tidak aktif atau tidak dapat diakses.`);
  console.log('👉 Pastikan Docker Desktop aktif dan container berjalan (`bun run docker:sync`).');
  process.exit(1);
}

const dockerEnvMap = new Map<string, string>();
for (const line of dockerEnvOutput.split('\n')) {
  const trimmed = line.trim();
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const key = trimmed.substring(0, eqIdx);
    const val = trimmed.substring(eqIdx + 1);
    dockerEnvMap.set(key, val);
  }
}

function normalizeValue(v: string): string {
  let res = v.trim();
  if (
    (res.startsWith('"') && res.endsWith('"')) ||
    (res.startsWith("'") && res.endsWith("'"))
  ) {
    res = res.substring(1, res.length - 1);
  }
  return res;
}

const localLines = readFileSync(envPath, 'utf8').split('\n');
const localEnvMap = new Map<string, string>();

for (const line of localLines) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = normalizeValue(trimmed.substring(eqIdx + 1).trim());
      localEnvMap.set(key, val);
    }
  }
}

const EXPECTED_DIFF_KEYS = new Set([
  'APP_RUNTIME',
  'DATABASE_HOST',
  'REDIS_URL',
  'SMTP_HOST',
  'RABBITMQ_URL',
]);

const IGNORED_HOST_ONLY_KEYS = new Set([
  'POSTGRES_HOST_PORT',
  'MAIL_CLIENT_PORT',
  'RABBITMQ_HOST_PORT',
  'RABBITMQ_MGMT_HOST_PORT',
  'COMPOSE_PROJECT_NAME',
  'E2E_BASE_URL',
  'E2E_MAILPIT_BASE_URL',
]);

console.log('Key Name'.padEnd(38) + 'Status'.padEnd(20) + 'Notes');
console.log('-'.repeat(80));

let unexpectedDiffCount = 0;
let missingCount = 0;
let matchCount = 0;

for (const [key, localVal] of localEnvMap.entries()) {
  if (IGNORED_HOST_ONLY_KEYS.has(key)) {
    continue;
  }

  if (!dockerEnvMap.has(key)) {
    console.log(key.padEnd(38) + 'MISSING'.padEnd(20) + 'Tidak ditemukan di container');
    missingCount++;
    continue;
  }

  const dockerVal = normalizeValue(dockerEnvMap.get(key) || '');

  if (EXPECTED_DIFF_KEYS.has(key)) {
    console.log(key.padEnd(38) + 'EXPECTED_DIFF'.padEnd(20) + 'Topologi internal jaringan Docker');
    continue;
  }

  if (localVal === dockerVal) {
    console.log(key.padEnd(38) + 'SAME'.padEnd(20) + '100% Identik');
    matchCount++;
  } else {
    console.log(key.padEnd(38) + 'DIFF (UNEXPECTED)'.padEnd(20) + 'Nilai berbeda');
    unexpectedDiffCount++;
  }
}

console.log('-'.repeat(80));
console.log(`Ringkasan: ${matchCount} SAME, ${missingCount} MISSING, ${unexpectedDiffCount} UNEXPECTED DIFF.`);
console.log('🔒 Sesuai aturan keamanan enterprise, nilai rahasia tidak pernah ditampilkan.');
console.log('================================================================================\n');

if (unexpectedDiffCount > 0 || missingCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

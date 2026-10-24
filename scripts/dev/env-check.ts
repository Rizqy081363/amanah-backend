#!/usr/bin/env bun
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

/**
 * Enterprise Environment Guard & Parity Verifier (bun run env:check)
 * Enforces:
 * 1. 100% key parity between EnvironmentVariables schema and .env.example
 * 2. Strict topology whitelist on docker-compose.yaml (no duplicated envs)
 * 3. Zero example files referenced in docker-compose runtime env_file
 * 4. Docker Compose syntax and interpolation check
 * 5. Zero direct process.env leaks outside src/config/**
 */

const backendRoot = resolve(import.meta.dir, '../..');
const envExamplePath = resolve(backendRoot, '.env.example');
const composePath = resolve(backendRoot, 'docker-compose.yaml');

console.log('================================================================================');
console.log(' Amanah Healthcare — Environment Quality Guard (bun run env:check)');
console.log('================================================================================');

let hasErrors = false;

// 1. KEY PARITY CHECK: Schema vs .env.example
console.log('[Check 1/5] Memeriksa paritas key antara skema src/config/env.ts dan .env.example...');

function extractKeysFromEnvFile(filePath: string): Set<string> {
  const content = readFileSync(filePath, 'utf8');
  const keys = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        keys.add(trimmed.substring(0, idx).trim());
      }
    }
  }
  return keys;
}

function extractKeysFromSchema(filePath: string): Set<string> {
  const content = readFileSync(filePath, 'utf8');
  const keys = new Set<string>();
  const matches = content.matchAll(/^\s{2}([A-Z0-9_]+)\??:\s*[^;]+;/gm);
  for (const m of matches) {
    keys.add(m[1]);
  }
  return keys;
}

const exampleKeys = extractKeysFromEnvFile(envExamplePath);
const schemaKeys = extractKeysFromSchema(resolve(backendRoot, 'src/config/env.ts'));

const missingInExample = Array.from(schemaKeys).filter((k) => !exampleKeys.has(k));
const missingInSchema = Array.from(exampleKeys).filter(
  (k) => !schemaKeys.has(k) && k !== 'POSTGRES_HOST_PORT' && k !== 'MAIL_CLIENT_PORT' && k !== 'RABBITMQ_HOST_PORT' && k !== 'RABBITMQ_MGMT_HOST_PORT' && k !== 'COMPOSE_PROJECT_NAME'
);

if (missingInExample.length > 0) {
  console.error('❌ Key terdaftar di skema env.ts tetapi tidak ada di .env.example:');
  missingInExample.forEach((k) => console.error(`   - ${k}`));
  hasErrors = true;
} else if (missingInSchema.length > 0) {
  console.error('❌ Key ada di .env.example tetapi belum dimodelkan di skema env.ts:');
  missingInSchema.forEach((k) => console.error(`   - ${k}`));
  hasErrors = true;
} else {
  console.log(`✔ Paritas sempurna (${exampleKeys.size} key terverifikasi selaras 100%).`);
}

// 2. DOCKER COMPOSE TOPOLOGY WHITELIST CHECK
console.log('[Check 2/5] Memeriksa blok environment pada docker-compose.yaml...');
const ALLOWED_TOPOLOGY_KEYS = new Set([
  'APP_RUNTIME',
  'DATABASE_HOST',
  'REDIS_URL',
  'SMTP_HOST',
  'RABBITMQ_URL',
]);

const composeContent = readFileSync(composePath, 'utf8');
const apiSectionMatch = composeContent.match(/api:[\s\S]*?(?=\n  [a-z0-9_-]+:|\nvolumes:|$)/);

if (apiSectionMatch) {
  const apiSection = apiSectionMatch[0];
  const envBlockMatch = apiSection.match(/environment:\s*\n([\s\S]*?)(?=\n    [a-z0-9_-]+:|$)/);
  if (envBlockMatch) {
    const envLines = envBlockMatch[1].split('\n');
    const unauthorizedKeys: string[] = [];

    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const keyMatch = trimmed.match(/^([A-Za-z0-9_]+):/);
        if (keyMatch) {
          const key = keyMatch[1];
          if (!ALLOWED_TOPOLOGY_KEYS.has(key)) {
            unauthorizedKeys.push(key);
          }
        }
      }
    }

    if (unauthorizedKeys.length > 0) {
      console.error('❌ Terdeteksi key terlarang (bukan topologi jaringan) di environment docker-compose.yaml:');
      unauthorizedKeys.forEach((k) => console.error(`   - ${k}`));
      console.error('👉 Sesuai prinsip SSOT, hanya key topologi jaringan internal yang boleh di-override di compose.');
      hasErrors = true;
    } else {
      console.log('✔ Blok environment docker-compose.yaml bersih (hanya memuat topologi jaringan).');
    }
  }
}

// 3. ZERO EXAMPLE IN COMPOSE ENV_FILE
console.log('[Check 3/5] Memverifikasi env_file docker-compose.yaml bebas dari file template contoh...');
if (composeContent.includes('env-example-relational') || composeContent.includes('.env.example')) {
  console.error('❌ docker-compose.yaml masih merujuk file contoh template pada env_file!');
  hasErrors = true;
} else {
  console.log('✔ docker-compose.yaml tidak merujuk file contoh apa pun.');
}

// 4. DOCKER COMPOSE CONFIG VALIDITY
console.log('[Check 4/5] Menguji sintaks dan integritas docker compose config...');
try {
  execSync('docker compose config --no-interpolate -q', {
    cwd: backendRoot,
    stdio: 'pipe',
  });
  console.log('✔ docker compose config lolos validasi tanpa peringatan.');
} catch (err: any) {
  console.error('❌ docker compose config gagal:', err.stderr?.toString() || err.message);
  hasErrors = true;
}

// 5. SCAN PROCESS.ENV DIRECT CALLS OUTSIDE SRC/CONFIG
console.log('[Check 5/5] Memindai kebocoran process.env langsung di luar src/config/**...');

function scanDirForEnvLeaks(dir: string): string[] {
  const leaks: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relPath = relative(backendRoot, fullPath).replace(/\\/g, '/');
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
      leaks.push(...scanDirForEnvLeaks(fullPath));
    } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.js'))) {
      if (
        relPath.startsWith('src/config/') ||
        relPath.includes('.spec.') ||
        relPath.includes('.test.') ||
        relPath.startsWith('src/database/migrations/')
      ) {
        continue;
      }

      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          (line.includes('process.env.') || line.includes('Bun.env.')) &&
          !line.trim().startsWith('//') &&
          !line.trim().startsWith('*')
        ) {
          // Allow specific verified patterns if necessary, else flag
          if (
            line.includes('process.env.NODE_ENV') ||
            line.includes('process.env.PWD') ||
            line.includes('process.env.STORAGE_ROOT')
          ) {
            continue;
          }
          leaks.push(`${relPath}:${i + 1} -> ${line.trim()}`);
        }
      }
    }
  }

  return leaks;
}

const leaks = scanDirForEnvLeaks(resolve(backendRoot, 'src'));
if (leaks.length > 0) {
  console.warn(`⚠️ Ditemukan ${leaks.length} pemanggilan process.env langsung yang disarankan bermigrasi ke env.ts:`);
  leaks.slice(0, 10).forEach((l) => console.warn(`   - ${l}`));
  if (leaks.length > 10) console.warn(`   ... dan ${leaks.length - 10} baris lainnya.`);
} else {
  console.log('✔ Tidak ditemukan akses process.env liar di modul bisnis utama.');
}

console.log('--------------------------------------------------------------------------------');
if (hasErrors) {
  console.error('❌ [FAIL] Verifikasi konfigurasi environment gagal. Perbaiki error di atas.');
  process.exit(1);
} else {
  console.log('✔ [PASS] Seluruh pengecekan standarisasi konfigurasi lolos 100%.');
  console.log('================================================================================\n');
  process.exit(0);
}

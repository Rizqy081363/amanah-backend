#!/usr/bin/env bun
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Enterprise Environment Setup Script
 * - Copies .env.example to .env only if .env does not exist.
 * - Auto-generates cryptographically strong random secrets (32 bytes hex) for empty *_SECRET keys.
 * - Strictly never prints or exposes generated secret values.
 */

const backendRoot = resolve(import.meta.dir, '../..');
const envExamplePath = resolve(backendRoot, '.env.example');
const envPath = resolve(backendRoot, '.env');

console.log('================================================================================');
console.log(' Amanah Healthcare — Environment Setup Tool (bun run setup:env)');
console.log('================================================================================');

if (existsSync(envPath)) {
  console.log('[INFO] File .env sudah ada di direktori backend/.');
  console.log('[INFO] Script tidak menimpa .env yang sudah ada untuk menjaga integritas konfigurasi lokal.');
  console.log('================================================================================\n');
  process.exit(0);
}

if (!existsSync(envExamplePath)) {
  console.error(`[ERROR] File template .env.example tidak ditemukan di: ${envExamplePath}`);
  process.exit(1);
}

const templateContent = readFileSync(envExamplePath, 'utf8');
const lines = templateContent.split('\n');
const generatedKeys: string[] = [];

const processedLines = lines.map((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return line;
  }

  const separatorIndex = line.indexOf('=');
  if (separatorIndex === -1) {
    return line;
  }

  const key = line.substring(0, separatorIndex).trim();
  const value = line.substring(separatorIndex + 1).trim();

  // If key ends with _SECRET and has an empty value, generate a 32-byte hex secret
  if (key.endsWith('_SECRET') && (value === '' || value === '""' || value === "''")) {
    const generatedSecret = randomBytes(32).toString('hex');
    generatedKeys.push(key);
    return `${key}=${generatedSecret}`;
  }

  return line;
});

writeFileSync(envPath, processedLines.join('\n'), 'utf8');

console.log('✔ Berhasil membuat file .env baru dari .env.example.');
if (generatedKeys.length > 0) {
  console.log('✔ Berhasil mengenerate secret acak berkekuatan tinggi (64 hex characters) untuk key:');
  generatedKeys.forEach((key) => console.log(`   - ${key}`));
  console.log('🔒 Sesuai aturan keamanan enterprise, nilai secret tidak dicetak ke output.');
}
console.log('================================================================================\n');

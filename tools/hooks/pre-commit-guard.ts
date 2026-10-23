import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Pre-Commit Guard for Amanah Healthcare Backend
 * Enforces:
 * 1. Zero secret / raw .env leaks (prompts to use pack-vault)
 * 2. Pure LF line endings (auto-normalizes CRLF on staged files)
 * 3. DB Atlas schema drift gate (verifies db-atlas is in sync when migrations/entities change)
 */

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err: any) {
    return (err.stdout || err.stderr || '').trim();
  }
}

function getStagedFiles(): string[] {
  const output = run('git diff --cached --name-only --diff-filter=ACM');
  if (!output) return [];
  return output.split('\n').map((f) => f.trim()).filter(Boolean);
}

const staged = getStagedFiles();
if (staged.length === 0) {
  process.exit(0);
}

console.log(`[PRE-COMMIT] Validating ${staged.length} staged file(s)...`);

// -----------------------------------------------------------------------------
// 1. SECRET & RAW ENV LEAK GUARD
// -----------------------------------------------------------------------------
const SENSITIVE_PATTERNS = [
  /^\.env(\..+)?$/,
  /\.env(\..+)?$/,
  /firebase-adminsdk.*\.json$/i,
  /id_rsa/i,
  /\.(pem|key|pfx|keystore|jks)$/i,
];

const ALLOWED_TEMPLATES = [
  /\.example(\..+)?$/i,
  /\.example$/i,
  /example/i,
  /\.config\.ya?ml$/i,
];

const leakedSecrets: string[] = [];
for (const file of staged) {
  const isTemplate = ALLOWED_TEMPLATES.some((p) => p.test(file));
  if (isTemplate) continue;

  const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(file));
  if (isSensitive) {
    leakedSecrets.push(file);
  }
}

if (leakedSecrets.length > 0) {
  console.error('\n❌ [SECRET LEAK GUARD] Terdeteksi file kredensial/environment mentah yang di-stage:');
  leakedSecrets.forEach((f) => console.error(`   - ${f}`));
  console.error('\n⚠️ DILARANG meng-commit kredensial/environment mentah ke git repository!');
  console.error('👉 Gunakan tooling Team Vault untuk membungkus environment secara aman:');
  console.error('   powershell: .\\pack-vault.ps1 (atau "bun run vault:pack")\n');
  process.exit(1);
}

// -----------------------------------------------------------------------------
// 2. CRLF / EOL GUARD (Auto-normalize staged text files)
// -----------------------------------------------------------------------------
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json',
  '.dart', '.yaml', '.yml', '.md', '.txt',
  '.html', '.css', '.scss', '.sql', '.sh',
]);

let normalizedCount = 0;
for (const file of staged) {
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXTS.has(ext)) continue;

  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) continue;

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.includes('\r\n')) {
      fs.writeFileSync(fullPath, content.replace(/\r\n/g, '\n'), 'utf8');
      run(`git add "${file}"`);
      normalizedCount++;
    }
  } catch {
    // Ignore unreadable files
  }
}

if (normalizedCount > 0) {
  console.log(`✔ [EOL GUARD] Berhasil menormalisasi ${normalizedCount} file staged dari CRLF ke LF (\\n).`);
}

// -----------------------------------------------------------------------------
// 3. DB ATLAS SCHEMA DRIFT GATE
// -----------------------------------------------------------------------------
const touchesSchema = staged.some((f) =>
  f.includes('migrations/') ||
  f.includes('/schema/') ||
  f.includes('/entities/') ||
  f.includes('schema.ts') ||
  f.endsWith('.sql')
);

if (touchesSchema) {
  console.log('[PRE-COMMIT] Mendeteksi perubahan skema / migrasi database. Memeriksa kesinkronan DB Atlas...');
  try {
    execSync('bun run db:atlas:check', { stdio: 'inherit' });
    console.log('✔ [DB ATLAS] Peta skema db-atlas/ tersinkron sempurna.');
  } catch {
    console.error('\n❌ [DB ATLAS DRIFT GATE] Skema database telah berubah namun db-atlas/ belum diperbarui!');
    console.error('👉 Jalankan perintah berikut untuk menggenerasi peta terbaru:');
    console.error('   powershell: .\\dbatlas.ps1 generate (atau "bun run db:atlas")');
    console.error('   lalu stage perubahan dengan: git add db-atlas/\n');
    process.exit(1);
  }
}

console.log('✔ [PRE-COMMIT] Seluruh validasi guard lolos. Melanjutkan ke linter...');

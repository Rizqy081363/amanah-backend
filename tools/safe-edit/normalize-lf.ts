import * as fs from 'fs';
import * as path from 'path';

const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json',
  '.dart', '.yaml', '.yml', '.md', '.txt',
  '.html', '.css', '.scss', '.sql', '.sh',
  '.prisma', '.env', '.example',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build',
  '.dart_tool', '.idea', '.vscode', '.next',
  'coverage', 'vendor', '.erd-dist', 'ios', 'android',
]);

let scanned = 0;
let converted = 0;

function walk(dir: string) {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTS.has(ext)) {
        scanned++;
        const fullPath = path.join(dir, entry.name);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('\r\n')) {
            const normalized = content.replace(/\r\n/g, '\n');
            fs.writeFileSync(fullPath, normalized, 'utf8');
            converted++;
          }
        } catch {
          // Ignore binary or unreadable files
        }
      }
    }
  }
}

const targetDirs = process.argv.slice(2);
const roots = targetDirs.length > 0 ? targetDirs : ['backend', 'frontend-web', 'amanah-healthcare-mobile'];

console.log(`[NORMALIZE] Scanning directories: ${roots.join(', ')}...`);
const start = performance.now();
for (const r of roots) {
  const abs = path.resolve(process.cwd(), r);
  if (fs.existsSync(abs)) {
    walk(abs);
  }
}
const elapsed = ((performance.now() - start) / 1000).toFixed(2);

console.log(`[NORMALIZE] Complete in ${elapsed}s! Scanned ${scanned} text files, converted ${converted} files to pure LF (\\n).`);

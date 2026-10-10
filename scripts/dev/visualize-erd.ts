import { exec, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { isAbsolute, join, relative, resolve } from "node:path";

// ============================================================================
// Utility: Port Finder (Menjamin port TIDAK bentrok)
// ============================================================================
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = createServer();
    s.once("error", () => res(false));
    s.once("listening", () => {
      s.close(() => res(true));
    });
    s.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(preferredPorts = [4321, 4500, 5050, 5500, 8088]): Promise<number> {
  for (const port of preferredPorts) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  for (let port = 6000; port <= 6100; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return 0; // Fallback ke OS ephemeral port jika semua terisi
}

// ============================================================================
// Utility: Open Browser
// ============================================================================
function openBrowser(url: string) {
  try {
    if (process.platform === "win32") {
      exec(`start "" "${url}"`);
    } else if (process.platform === "darwin") {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch {
    // Non-blocking jika environment headless
  }
}

// ============================================================================
// Helper: Ubah path Windows absolut ke path relatif yang aman untuk Liam CLI
// Bug di Liam CLI: Jika diberikan path Windows 'D:\...', ia mengira 'D:' adalah URL scheme
// dan memanggil fetch(), sehingga path WAJIB relatif dengan forward slash (./...)
// ============================================================================
function toLiamSafePath(filePath: string): string {
  const cwd = process.cwd();
  let rel = relative(cwd, filePath).replace(/\\/g, "/");
  if (!rel.startsWith("./") && !rel.startsWith("../")) {
    rel = `./${rel}`;
  }
  return rel;
}

// ============================================================================
// Helper: Cari file backup terbaru di folder backup/
// ============================================================================
function getLatestBackupFile(backupDir: string): string | null {
  if (!existsSync(backupDir)) return null;

  const files = readdirSync(backupDir)
    .filter((f) => f.endsWith(".sql") || f.endsWith(".dump"))
    .map((name) => {
      const fullPath = join(backupDir, name);
      return { name, path: fullPath, mtime: statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].path : null;
}

// ============================================================================
// Main Execution
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();
  const backupDir = join(cwd, "backup");
  const outputDir = join(cwd, ".erd-dist");
  mkdirSync(outputDir, { recursive: true });

  const isCurrent = args.includes("--current");
  const isHelp = args.includes("--help") || args.includes("-h");

  if (isHelp) {
    console.log(`
AMANAH HEALTHCARE - ERD VISUALIZER
==========================================================
Penggunaan:
  bun run db:visualize --current              Visualisasi database aktif saat ini (Docker)
  bun run db:visualize                        Visualisasi file backup terbaru di folder backup/
  bun run db:visualize <path-to-sql-file>     Visualisasi file SQL / backup spesifik
  bun run db:visualize --backup <file>        Visualisasi file backup spesifik

Contoh:
  bun run db:visualize --current
  bun run db:visualize backup/backup_amanah_healthcare_20261010_074700.sql
==========================================================
`);
    process.exit(0);
  }

  let targetSqlPath: string | null = null;
  let sourceDescription = "";
  let isTempFile = false;

  // 1. Cek jika mode --current (Live database dari container Docker)
  if (isCurrent) {
    console.log("==========================================================");
    console.log(" [MODE: LIVE DATABASE]");
    console.log(" Mengekstrak schema dari Docker container 'backend-postgres-1'...");
    console.log("==========================================================");

    const tempSchema = join(cwd, ".temp_live_schema.sql");
    try {
      execSync(
        "docker exec backend-postgres-1 pg_dump -U amanah -d amanah_healthcare --schema-only --no-owner --no-privileges -f /tmp/erd_live_schema.sql",
        { stdio: "inherit" },
      );
      execSync(`docker cp backend-postgres-1:/tmp/erd_live_schema.sql "${tempSchema}"`, {
        stdio: "inherit",
      });
      execSync("docker exec backend-postgres-1 rm -f /tmp/erd_live_schema.sql", {
        stdio: "ignore",
      });

      targetSqlPath = tempSchema;
      isTempFile = true;
      sourceDescription = "Live Database Aktif (Postgres Container: backend-postgres-1)";
    } catch (err) {
      console.error("\n[ERROR] Gagal mengekstrak schema dari Docker container 'backend-postgres-1'.");
      console.error("Pastikan container postgres sedang aktif (docker compose up -d postgres).");
      process.exit(1);
    }
  }

  // 2. Cek jika file ditentukan via argumen CLI (positional, --backup, atau --file)
  if (!targetSqlPath) {
    let fileArg: string | null = null;
    const backupFlagIndex = args.indexOf("--backup");
    const fileFlagIndex = args.indexOf("--file");

    if (backupFlagIndex !== -1 && args[backupFlagIndex + 1]) {
      fileArg = args[backupFlagIndex + 1];
    } else if (fileFlagIndex !== -1 && args[fileFlagIndex + 1]) {
      fileArg = args[fileFlagIndex + 1];
    } else {
      // Cari argumen non-flag pertama yang bukan '-'
      const positional = args.find((a) => !a.startsWith("-") && a !== "-");
      if (positional) fileArg = positional;
    }

    if (fileArg) {
      const candidatePath = isAbsolute(fileArg) ? fileArg : resolve(cwd, fileArg);
      const inBackupDir = join(backupDir, fileArg);

      if (existsSync(candidatePath)) {
        targetSqlPath = candidatePath;
      } else if (existsSync(inBackupDir)) {
        targetSqlPath = inBackupDir;
      } else {
        console.error(`\n[ERROR] File backup '${fileArg}' tidak ditemukan!`);
        process.exit(1);
      }
      sourceDescription = `File Backup: ${targetSqlPath}`;
    }
  }

  // 3. Cek jika ada input melalui PIPE (stdin) eksplisit (- atau --pipe)
  if (!targetSqlPath && (args.includes("-") || args.includes("--pipe"))) {
    console.log("[INFO] Membaca input SQL melalui pipe (stdin)...");
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const pipedData = Buffer.concat(chunks).toString("utf-8");
    if (pipedData.trim().length > 0) {
      const pipedFile = join(cwd, ".temp_piped_schema.sql");
      writeFileSync(pipedFile, pipedData, "utf-8");
      targetSqlPath = pipedFile;
      isTempFile = true;
      sourceDescription = "Input Pipe (stdin)";
    }
  }

  // 4. Fallback jika tidak ada argumen: ambil file backup terbaru
  if (!targetSqlPath) {
    const latest = getLatestBackupFile(backupDir);
    if (latest) {
      targetSqlPath = latest;
      sourceDescription = `File Backup Terbaru: ${latest}`;
      console.log(`[INFO] Menggunakan file backup terbaru: ${latest}`);
      console.log("       (Tips: gunakan 'bun run db:visualize --current' untuk DB real-time saat ini)\n");
    } else {
      console.error("\n[ERROR] Tidak ditemukan file backup di folder 'backup/' dan flag '--current' tidak digunakan.");
      console.error("Jalankan 'bun run backup:pull' terlebih dahulu atau gunakan 'bun run db:visualize --current'.");
      process.exit(1);
    }
  }

  // 5. Generate ERD menggunakan engine Liam ERD
  console.log("----------------------------------------------------------");
  console.log(`[1/3] Membangun visualisasi relasi ERD menggunakan engine Liam ERD...`);
  console.log(`Sumber Schema : ${sourceDescription}`);
  console.log("----------------------------------------------------------");

  const safeInputPath = toLiamSafePath(targetSqlPath);

  try {
    execSync(
      `bun liam erd build --format postgres --input "${safeInputPath}" --output-dir "${toLiamSafePath(outputDir)}"`,
      { stdio: "inherit" },
    );
  } catch (err) {
    console.error("\n[ERROR] Gagal mem-build visualisasi ERD dengan Liam CLI.");
    process.exit(1);
  } finally {
    if (isTempFile && targetSqlPath && existsSync(targetSqlPath)) {
      rmSync(targetSqlPath, { force: true });
    }
  }

  // 6. Jalankan Local Web Server di Port Bebas Bentrok
  const port = await findAvailablePort();
  if (port === 0) {
    console.error("[ERROR] Tidak dapat menemukan port yang tersedia.");
    process.exit(1);
  }

  console.log(`[2/3] Membuka web server lokal di port dinamis (Bebas bentrok: ${port})...`);

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") {
        pathname = "/index.html";
      }

      const filePath = join(outputDir, pathname.startsWith("/") ? pathname.slice(1) : pathname);
      const file = Bun.file(filePath);

      if (await file.exists()) {
        return new Response(file);
      }

      // SPA fallback
      const indexFile = Bun.file(join(outputDir, "index.html"));
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          headers: { "Content-Type": "text/html" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  const appUrl = `http://localhost:${server.port}`;

  console.log("==========================================================");
  console.log("            VISUALISASI ERD BERHASIL TERSEDIA!");
  console.log("==========================================================");
  console.log(`Teknologi Engine : Liam ERD (React Flow Interactive Relational Canvas)`);
  console.log(`Server URL       : ${appUrl}`);
  console.log(`Port Digunakan   : ${server.port} (Anti-Bentrok)`);
  console.log(`Sumber Data      : ${sourceDescription}`);
  console.log("==========================================================");
  console.log("[3/3] Membuka visualisasi di browser Anda secara otomatis...");

  openBrowser(appUrl);

  console.log("\n[RUNNING] Server aktif. Tekan Ctrl + C di terminal untuk menutup server.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

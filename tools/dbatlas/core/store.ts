/**
 * DB Atlas - Atomic Store & Output Writer (P4 & P5)
 * Guarantees zero half-written states, LF line endings, and UTF-8 without BOM.
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface FilePayload {
  relativePath: string;
  content: string;
}

export class DbAtlasStore {
  /**
   * Menulis file ke disk dengan normalisasi LF dan UTF-8 tanpa BOM.
   */
  static writeNormalizedFile(filePath: string, content: string): void {
    const parent = dirname(filePath);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true });
    }

    // Normalisasi LF (CRLF -> LF) dan buang BOM jika ada
    const normalized = content.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
    writeFileSync(filePath, normalized, { encoding: 'utf8' });
  }

  /**
   * Menulis seluruh file artefak secara atomik menggunakan folder sementara,
   * lalu melakukan swap folder untuk mencegah kondisi cacat (half-written map).
   */
  static atomicWrite(targetDir: string, files: FilePayload[]): void {
    const parentDir = dirname(targetDir);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const tmpDir = join(parentDir, `.db-atlas-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      // 1. Tulis semua file ke folder temporer
      for (const file of files) {
        const fullTmpPath = join(tmpDir, file.relativePath);
        this.writeNormalizedFile(fullTmpPath, file.content);
      }

      // 2. Tambahkan file .gitattributes untuk memaksakan LF di Git
      this.writeNormalizedFile(
        join(tmpDir, '.gitattributes'),
        '* text eol=lf\n*.json text eol=lf\n*.md text eol=lf\n*.mmd text eol=lf\n'
      );

      // 3. Swap atomik
      const backupDir = join(parentDir, `.db-atlas-old-${Date.now()}`);
      let hasOld = false;
      if (existsSync(targetDir)) {
        hasOld = true;
        renameSync(targetDir, backupDir);
      }

      try {
        renameSync(tmpDir, targetDir);
        if (hasOld && existsSync(backupDir)) {
          rmSync(backupDir, { recursive: true, force: true });
        }
      } catch (swapErr) {
        // Rollback jika rename gagal
        if (hasOld && existsSync(backupDir)) {
          renameSync(backupDir, targetDir);
        }
        throw swapErr;
      }
    } catch (err) {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
      throw err;
    }
  }
}

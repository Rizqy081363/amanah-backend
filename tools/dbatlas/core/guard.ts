/**
 * DB Atlas - Security Guard & SQL Allowlist (Principle P2 & P3)
 * Guarantees zero write capabilities and strictly read-only catalog access.
 */

import type { TargetEnvironment } from '../config/config.interface';

const ALLOWED_SQL_PREFIXES = [
  'SELECT',
  'WITH',
  'SHOW',
  'BEGIN',
  'ROLLBACK',
  'SET',
];

const PROHIBITED_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXECUTE',
  'CALL',
  'COPY',
];

export class DbAtlasSecurityError extends Error {
  constructor(message: string) {
    super(`[DbAtlas Guard Violation] ${message}`);
    this.name = 'DbAtlasSecurityError';
  }
}

export class DbAtlasGuard {
  /**
   * Memvalidasi bahwa query SQL yang akan dieksekusi benar-benar read-only.
   */
  static validateSql(sql: string): void {
    const trimmed = sql.trim().replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').trim();
    if (!trimmed) {
      throw new DbAtlasSecurityError('Query SQL kosong');
    }

    const firstWord = (trimmed.split(/\s+/)[0] || '').toUpperCase();
    if (!ALLOWED_SQL_PREFIXES.includes(firstWord)) {
      throw new DbAtlasSecurityError(
        `Perintah '${firstWord}' dilarang keras. Hanya query SELECT/WITH yang diizinkan.`
      );
    }

    // Periksa apakah ada keyword destruktif yang diselipkan
    const tokens = trimmed.toUpperCase().split(/[\s;,()]+/);
    for (const forbidden of PROHIBITED_KEYWORDS) {
      if (tokens.includes(forbidden)) {
        throw new DbAtlasSecurityError(
          `Keyword terlarang '${forbidden}' terdeteksi dalam query introspeksi.`
        );
      }
    }
  }

  /**
   * Menolak eksekusi jika target berupa staging/production tanpa persetujuan eksplisit.
   */
  static assertSafeTarget(target: TargetEnvironment, allowRemote = false): void {
    if ((target === 'prod' || target === 'staging') && !allowRemote) {
      throw new DbAtlasSecurityError(
        `Target '${target}' ditolak secara default untuk melindungi integritas sistem. Gunakan flag --allow-remote jika benar-benar dikehendaki.`
      );
    }
  }
}

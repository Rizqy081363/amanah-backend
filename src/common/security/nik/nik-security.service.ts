import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import type {
  INikSecurityService,
  SecureNikResult,
} from './nik-security.interface';

@Injectable()
export class NikSecurityService implements INikSecurityService {
  private readonly logger = new Logger(NikSecurityService.name);
  private readonly pepper: string;
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const customPepper = this.configService.get<string>('NIK_BLIND_INDEX_PEPPER');
    const customKey = this.configService.get<string>('NIK_ENCRYPTION_KEY');
    const fallbackSecret =
      this.configService.get<string>('AUTH_JWT_SECRET') ||
      this.configService.get<string>('BETTER_AUTH_SECRET') ||
      'amanah-healthcare-secure-default-secret-seed-32-chars';

    this.pepper =
      customPepper && customPepper.trim().length >= 16
        ? customPepper.trim()
        : createHmac('sha256', fallbackSecret)
            .update('amanah-nik-blind-index-pepper-seed')
            .digest('hex');

    if (customKey && customKey.trim().length === 64) {
      this.encryptionKey = Buffer.from(customKey.trim(), 'hex');
    } else if (customKey && customKey.trim().length === 32) {
      this.encryptionKey = Buffer.from(customKey.trim(), 'utf-8');
    } else {
      this.encryptionKey = createHmac('sha256', fallbackSecret)
        .update('amanah-nik-aes-gcm-encryption-key-seed')
        .digest();
    }
  }

  /**
   * Normalizes an Indonesian National Identity Number (NIK).
   * - Preserves leading zeros.
   * - Applies Unicode NFKC normalization.
   * - Strips whitespace, hyphens, and dots.
   * - Returns null if input is empty or nullish.
   */
  normalize(raw: unknown): string | null {
    if (raw === null || raw === undefined) {
      return null;
    }
    const str = String(raw).normalize('NFKC').trim();
    if (str === '') {
      return null;
    }
    return str.replace(/[\s.-]/g, '');
  }

  /**
   * Checks whether the normalized NIK has a valid 16-digit format.
   */
  isValid(normalized: string | null | undefined): boolean {
    if (!normalized) return false;
    return /^\d{16}$/.test(normalized);
  }

  /**
   * Parses and validates an incoming NIK.
   * Throws BadRequestException (code: NIK_INVALID) if format is invalid.
   */
  parseOrThrow(raw: unknown): string {
    const normalized = this.normalize(raw);
    if (!normalized || !this.isValid(normalized)) {
      throw new BadRequestException({
        code: 'NIK_INVALID',
        message: 'Format NIK tidak valid. NIK harus terdiri dari 16 digit angka.',
        errors: [
          {
            field: 'nik',
            code: 'NIK_INVALID',
            message:
              'Format NIK tidak valid. NIK harus terdiri dari 16 digit angka.',
          },
        ],
      });
    }
    return normalized;
  }

  /**
   * Computes a deterministic HMAC-SHA-256 blind index for database uniqueness and lookup.
   * Irreversible, non-brute-forceable due to the server-side pepper.
   */
  computeBlindIndex(nik: string): string {
    const cleanNik = this.parseOrThrow(nik);
    return createHmac('sha256', this.pepper).update(cleanNik).digest('hex');
  }

  /**
   * Reversibly encrypts a NIK using AES-256-GCM.
   * Format: `${ivHex}:${authTagHex}:${ciphertextHex}`
   */
  encrypt(nik: string): string {
    const cleanNik = this.parseOrThrow(nik);
    const iv = randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let ciphertext = cipher.update(cleanNik, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
  }

  /**
   * Decrypts an AES-256-GCM encrypted NIK payload.
   * If the input is legacy plaintext (16 digits), safely returns it as-is for migration compatibility.
   */
  decrypt(ciphertextOrRaw: string | null | undefined): string | null {
    if (!ciphertextOrRaw) {
      return null;
    }

    const trimmed = ciphertextOrRaw.trim();
    const parts = trimmed.split(':');

    // Expected AES-256-GCM format: iv (24 hex chars) : authTag (32 hex chars) : ciphertext (at least 32 hex chars)
    if (parts.length === 3 && parts[0].length === 24 && parts[1].length === 32) {
      try {
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const ciphertext = parts[2];

        const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (err: unknown) {
        this.logger.error(
          `Failed to decrypt NIK ciphertext: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    }

    // Graceful backward compatibility for legacy plaintext records
    if (/^\d{16}$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  /**
   * Formats a NIK into a safe masked string for display.
   * Format: `3201••••••••1234`
   */
  mask(nikOrCiphertext: string | null | undefined): string {
    if (!nikOrCiphertext) {
      return '';
    }

    const decrypted = this.decrypt(nikOrCiphertext) || this.normalize(nikOrCiphertext);
    if (!decrypted) {
      return '';
    }

    if (decrypted.length === 16) {
      return `${decrypted.slice(0, 4)}••••••••${decrypted.slice(-4)}`;
    }

    if (decrypted.length > 8) {
      return `${decrypted.slice(0, 3)}••••••••${decrypted.slice(-3)}`;
    }

    return '••••••••';
  }

  /**
   * Atomically processes a raw NIK input into normalized, blindIndex, encrypted, and masked values.
   */
  secure(rawNik: unknown): SecureNikResult | null {
    const normalized = this.normalize(rawNik);
    if (!normalized) {
      return null;
    }

    const validNik = this.parseOrThrow(normalized);
    const blindIndex = this.computeBlindIndex(validNik);
    const encrypted = this.encrypt(validNik);
    const masked = this.mask(validNik);

    return {
      normalized: validNik,
      blindIndex,
      encrypted,
      masked,
    };
  }
}

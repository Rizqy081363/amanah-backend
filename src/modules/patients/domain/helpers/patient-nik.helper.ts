import { BadRequestException } from '@nestjs/common';

/**
 * Normalizes an Indonesian National Identity Number (NIK).
 * - Preserves leading zeros (treated as string).
 * - Applies Unicode NFKC normalization.
 * - Strips whitespace, hyphens, and dots.
 * - Returns null if the input is absent or empty whitespace.
 */
export function normalizeNik(raw: unknown): string | null {
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
export function isValidNik(normalized: string | null | undefined): boolean {
  if (!normalized) return false;
  return /^\d{16}$/.test(normalized);
}

/**
 * Parses and validates an incoming NIK.
 * Throws BadRequestException (code: NIK_INVALID) if format is invalid.
 */
export function parseNikOrThrow(raw: unknown): string {
  const normalized = normalizeNik(raw);
  if (!normalized || !isValidNik(normalized)) {
    throw new BadRequestException({
      code: 'NIK_INVALID',
      message: 'Format NIK tidak valid. NIK harus terdiri dari 16 digit angka.',
      errors: [
        {
          field: 'nik',
          code: 'NIK_INVALID',
          message: 'Format NIK tidak valid. NIK harus terdiri dari 16 digit angka.',
        },
      ],
    });
  }
  return normalized;
}

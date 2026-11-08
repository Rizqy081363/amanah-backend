import { NikSecurityService } from '../../../../src/common/security/nik';
import type { SecureNikResult } from '../../../../src/common/security/nik';

// Instantiate NikSecurityService using environment variables
const pepper = process.env.NIK_BLIND_INDEX_PEPPER;
const key = process.env.NIK_ENCRYPTION_KEY;

if (!pepper || !key) {
  throw new Error('NIK_BLIND_INDEX_PEPPER and NIK_ENCRYPTION_KEY must be configured in environment');
}

export const nikSecurityService = new NikSecurityService({
  get: (k: string) => process.env[k],
} as any);

/**
 * Generates an authentic Indonesian National Identity Number (NIK) conforming to Dukcapil format:
 * - Digits 1-6: Province (32 = Jabar), Regency (73 = Kota Bandung), District (01) -> default '327301'
 * - Digits 7-12: Birth Date (DDMMYY). For females, DD is offset by +40.
 * - Digits 13-16: Daily registration sequence (0001..9999).
 */
export function buildIndonesianNik(
  birthDate: string, // YYYY-MM-DD
  gender: 'male' | 'female',
  sequence: number,
  regionCode = '327301'
): string {
  const parts = birthDate.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid birthDate format: ${birthDate}, expected YYYY-MM-DD`);
  }

  const yyyy = parts[0];
  const mm = parts[1];
  const dd = parts[2];

  let dayInt = parseInt(dd, 10);
  if (gender === 'female') {
    dayInt += 40;
  }
  const ddStr = String(dayInt).padStart(2, '0');
  const mmStr = mm.padStart(2, '0');
  const yyStr = yyyy.slice(2);
  const seqStr = String(sequence % 9999 || 1).padStart(4, '0');

  const rawNik = `${regionCode}${ddStr}${mmStr}${yyStr}${seqStr}`;
  if (!/^\d{16}$/.test(rawNik)) {
    throw new Error(`Constructed NIK is invalid: ${rawNik}`);
  }
  return rawNik;
}

/**
 * Atomically generates and secures a valid NIK with HMAC-SHA256 blind index and AES-256-GCM encryption.
 */
export function generateSecuredNik(
  birthDate: string,
  gender: 'male' | 'female',
  sequence: number,
  regionCode = '327301'
): SecureNikResult {
  const raw = buildIndonesianNik(birthDate, gender, sequence, regionCode);
  const secured = nikSecurityService.secure(raw);
  if (!secured) {
    throw new Error(`Failed to secure NIK: ${raw}`);
  }
  return secured;
}

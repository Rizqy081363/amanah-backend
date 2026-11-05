export interface SecureNikResult {
  normalized: string;
  blindIndex: string;
  encrypted: string;
  masked: string;
}

export interface INikSecurityService {
  normalize(raw: unknown): string | null;
  isValid(normalized: string | null | undefined): boolean;
  parseOrThrow(raw: unknown): string;
  computeBlindIndex(nik: string): string;
  encrypt(nik: string): string;
  decrypt(ciphertextOrRaw: string | null | undefined): string | null;
  mask(nikOrCiphertext: string | null | undefined): string;
  secure(rawNik: unknown): SecureNikResult | null;
}

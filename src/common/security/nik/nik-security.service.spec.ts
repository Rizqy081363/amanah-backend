import { describe, expect, it } from 'bun:test';
import { NikSecurityService } from './nik-security.service';

describe('NikSecurityService - Strict Environment Keys', () => {
  const validKey = '5e82cd3d8f5dac1486b3b23894e2ed02cd8740c77638b192dbb3b4c14f9073b0';
  const validPepper = '7b21df0796eb46121581483959836847f1eecb406da015eb63facdd11441149f';

  it('should initialize cleanly when valid key and pepper are provided in config', () => {
    const configMock = {
      get: (k: string) => {
        if (k === 'NIK_ENCRYPTION_KEY') return validKey;
        if (k === 'NIK_BLIND_INDEX_PEPPER') return validPepper;
        return undefined;
      },
    };

    const service = new NikSecurityService(configMock as any);
    expect(service).toBeDefined();

    const sampleNik = '3201234567890001';
    const secured = service.secure(sampleNik);
    expect(secured).not.toBeNull();
    expect(secured?.blindIndex).toHaveLength(64);
    expect(secured?.masked).toBe('••••••••••••••••');

    const decrypted = service.decrypt(secured?.encrypted);
    expect(decrypted).toBe(sampleNik);
  });

  it('should throw an error if NIK_BLIND_INDEX_PEPPER is missing or too short', () => {
    const configMock = {
      get: (k: string) => {
        if (k === 'NIK_ENCRYPTION_KEY') return validKey;
        if (k === 'NIK_BLIND_INDEX_PEPPER') return 'short';
        return undefined;
      },
    };

    expect(() => new NikSecurityService(configMock as any)).toThrow(
      'NIK_BLIND_INDEX_PEPPER is required in environment and must be at least 16 characters long',
    );
  });

  it('should throw an error if NIK_ENCRYPTION_KEY is missing or invalid length', () => {
    const configMock = {
      get: (k: string) => {
        if (k === 'NIK_ENCRYPTION_KEY') return 'invalid_short_key';
        if (k === 'NIK_BLIND_INDEX_PEPPER') return validPepper;
        return undefined;
      },
    };

    expect(() => new NikSecurityService(configMock as any)).toThrow(
      'NIK_ENCRYPTION_KEY is required in environment and must be a 64-hex-character or 32-character string',
    );
  });
});

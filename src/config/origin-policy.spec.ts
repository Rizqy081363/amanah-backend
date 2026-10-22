import { describe, expect, it } from '@jest/globals';
import {
  buildOriginPolicy,
  isOriginAllowed,
  matchesOriginPattern,
} from './origin-policy';

describe('OriginPolicy (SSOT for Allowed Origins)', () => {
  describe('matchesOriginPattern', () => {
    it('matches wildcard devtunnel subdomains correctly', () => {
      const pattern = 'https://*.devtunnels.ms';
      expect(matchesOriginPattern('https://z45xmj4x-3000.asse.devtunnels.ms', pattern)).toBe(true);
      expect(matchesOriginPattern('https://my-tunnel.devtunnels.ms', pattern)).toBe(true);
      expect(matchesOriginPattern('http://my-tunnel.devtunnels.ms', pattern)).toBe(false);
      expect(matchesOriginPattern('https://evil.com', pattern)).toBe(false);
      expect(matchesOriginPattern('https://evil.devtunnels.ms.attacker.com', pattern)).toBe(false);
    });

    it('matches exact strings when pattern has no wildcard', () => {
      expect(matchesOriginPattern('http://localhost:3000', 'http://localhost:3000')).toBe(true);
      expect(matchesOriginPattern('http://localhost:3001', 'http://localhost:3000')).toBe(false);
    });
  });

  describe('buildOriginPolicy', () => {
    it('builds exact origins and patterns in development', () => {
      const policy = buildOriginPolicy({
        appEnv: 'development',
        publicUrl: 'http://localhost:3000',
        extraOrigins: ['http://localhost:3001', 'https://staging.amanah.com'],
        devPatterns: ['https://*.devtunnels.ms'],
      });

      expect(policy.exact).toContain('http://localhost:3000');
      expect(policy.exact).toContain('http://localhost:3001');
      expect(policy.exact).toContain('https://staging.amanah.com');
      expect(policy.patterns).toEqual(['https://*.devtunnels.ms']);
    });

    it('throws error when dev patterns or wildcard are configured in production', () => {
      expect(() =>
        buildOriginPolicy({
          appEnv: 'production',
          publicUrl: 'https://amanah.com',
          extraOrigins: ['*'],
          devPatterns: [],
        }),
      ).toThrow('[Security Invariant Violation]');

      expect(() =>
        buildOriginPolicy({
          appEnv: 'production',
          publicUrl: 'https://amanah.com',
          extraOrigins: [],
          devPatterns: ['https://*.devtunnels.ms'],
        }),
      ).toThrow('[Security Invariant Violation]');
    });
  });

  describe('isOriginAllowed', () => {
    const policy = buildOriginPolicy({
      appEnv: 'development',
      publicUrl: 'http://localhost:3000',
      extraOrigins: ['http://localhost:3001'],
      devPatterns: ['https://*.devtunnels.ms'],
    });

    it('allows requests without origin header (server-to-server, curl, mobile)', () => {
      expect(isOriginAllowed(undefined, policy)).toBe(true);
      expect(isOriginAllowed(null, policy)).toBe(true);
      expect(isOriginAllowed('', policy)).toBe(true);
    });

    it('allows exact matches from configured origins', () => {
      expect(isOriginAllowed('http://localhost:3000', policy)).toBe(true);
      expect(isOriginAllowed('http://localhost:3001', policy)).toBe(true);
    });

    it('allows origins matching dev wildcard patterns', () => {
      expect(isOriginAllowed('https://z45xmj4x-3000.asse.devtunnels.ms', policy)).toBe(true);
    });

    it('rejects unauthorized third-party origins', () => {
      expect(isOriginAllowed('https://malicious-site.com', policy)).toBe(false);
      expect(isOriginAllowed('http://localhost:4000', policy)).toBe(false);
    });
  });
});

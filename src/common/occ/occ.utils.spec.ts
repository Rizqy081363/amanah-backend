import {
  formatETag,
  generateEntityVersion,
  matchesVersion,
  normalizeVersion,
} from './occ.utils';

describe('OCC Utilities', () => {
  describe('generateEntityVersion', () => {
    it('should generate millisecond epoch string from Date', () => {
      const d = new Date('2026-09-18T01:00:00.000Z');
      expect(generateEntityVersion(d)).toBe(d.getTime().toString());
    });

    it('should generate millisecond epoch string from ISO string', () => {
      const iso = '2026-09-18T01:00:00.000Z';
      const expected = new Date(iso).getTime().toString();
      expect(generateEntityVersion(iso)).toBe(expected);
    });

    it('should return "1" when null or undefined is passed', () => {
      expect(generateEntityVersion(null)).toBe('1');
      expect(generateEntityVersion(undefined)).toBe('1');
    });
  });

  describe('normalizeVersion', () => {
    it('should strip quotes and weak prefixes', () => {
      expect(normalizeVersion('12345')).toBe('12345');
      expect(normalizeVersion('"12345"')).toBe('12345');
      expect(normalizeVersion('W/"12345"')).toBe('12345');
      expect(normalizeVersion("w/'12345'")).toBe('12345');
      expect(normalizeVersion('   W/"12345"   ')).toBe('12345');
    });

    it('should handle empty or null input', () => {
      expect(normalizeVersion('')).toBe('');
      expect(normalizeVersion(null)).toBe('');
      expect(normalizeVersion(undefined)).toBe('');
    });
  });

  describe('formatETag', () => {
    it('should format weak and strong ETags correctly', () => {
      expect(formatETag('12345')).toBe('W/"12345"');
      expect(formatETag('12345', false)).toBe('"12345"');
      expect(formatETag('W/"12345"')).toBe('W/"12345"');
    });
  });

  describe('matchesVersion', () => {
    const updatedAt = new Date('2026-09-18T01:00:00.000Z');
    const version = updatedAt.getTime().toString();

    it('should match wildcard *', () => {
      expect(matchesVersion('*', version, updatedAt)).toBe(true);
    });

    it('should match exact string version', () => {
      expect(matchesVersion(version, version, updatedAt)).toBe(true);
    });

    it('should match weak ETag header', () => {
      expect(matchesVersion(`W/"${version}"`, version, updatedAt)).toBe(true);
    });

    it('should match quoted string', () => {
      expect(matchesVersion(`"${version}"`, version, updatedAt)).toBe(true);
    });

    it('should match ISO timestamp format', () => {
      expect(
        matchesVersion('2026-09-18T01:00:00.000Z', version, updatedAt),
      ).toBe(true);
    });

    it('should match one from comma-separated list of candidates', () => {
      expect(
        matchesVersion(
          `"stale-version", W/"${version}", "another"`,
          version,
          updatedAt,
        ),
      ).toBe(true);
    });

    it('should return false on version mismatch', () => {
      expect(matchesVersion('999999999', version, updatedAt)).toBe(false);
      expect(matchesVersion('W/"999999999"', version, updatedAt)).toBe(false);
    });

    it('should return false on null or empty If-Match header', () => {
      expect(matchesVersion(null, version, updatedAt)).toBe(false);
      expect(matchesVersion('', version, updatedAt)).toBe(false);
    });
  });
});

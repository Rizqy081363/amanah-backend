import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor.utils';

describe('CursorPaginationUtils', () => {
  describe('encodeCursor', () => {
    it('should encode Date and id to opaque base64url string', () => {
      const date = new Date('2026-09-18T10:00:00.000Z');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      const cursor = encodeCursor({ createdAt: date, id });
      expect(typeof cursor).toBe('string');
      expect(cursor).not.toContain('+');
      expect(cursor).not.toContain('/');
      expect(cursor).not.toContain('=');

      // Decoding back must match
      const decoded = decodeCursor(cursor);
      expect(decoded.id).toBe(id);
      expect(decoded.createdAt.toISOString()).toBe(date.toISOString());
    });

    it('should support string date representations', () => {
      const dateStr = '2026-09-18T12:30:00.000Z';
      const id = 'abc-789';

      const cursor = encodeCursor({ createdAt: dateStr, id });
      const decoded = decodeCursor(cursor);
      expect(decoded.id).toBe(id);
      expect(decoded.createdAt.toISOString()).toBe(dateStr);
    });

    it('should throw BadRequestException if createdAt is invalid date', () => {
      expect(() => {
        encodeCursor({ createdAt: 'invalid-date', id: '123' });
      }).toThrow(BadRequestException);
    });
  });

  describe('decodeCursor', () => {
    it('should throw BadRequestException for non-string or empty input', () => {
      expect(() => decodeCursor('')).toThrow(BadRequestException);
      expect(() => decodeCursor(null as any)).toThrow(BadRequestException);
      expect(() => decodeCursor(undefined as any)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for malformed JSON in base64url', () => {
      const malformedBase64 =
        Buffer.from('not-valid-json').toString('base64url');
      expect(() => decodeCursor(malformedBase64)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if missing id or timestamp', () => {
      const missingId = Buffer.from(
        JSON.stringify({ t: '2026-09-18T10:00:00.000Z' }),
      ).toString('base64url');
      expect(() => decodeCursor(missingId)).toThrow(BadRequestException);

      const missingT = Buffer.from(JSON.stringify({ id: 'uuid-123' })).toString(
        'base64url',
      );
      expect(() => decodeCursor(missingT)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if timestamp is an invalid date string', () => {
      const invalidTimestamp = Buffer.from(
        JSON.stringify({ t: 'not-a-date', id: 'uuid-123' }),
      ).toString('base64url');
      expect(() => decodeCursor(invalidTimestamp)).toThrow(BadRequestException);
    });
  });
});

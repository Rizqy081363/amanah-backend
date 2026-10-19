import { describe, expect, it } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import {
  parseTimeEndToMinutes,
  validateSessionDefsNonOverlap,
  validateWeeklyTemplatesNonOverlap,
} from './shift-overlap.validator';

describe('Shift Overlap Validator', () => {
  describe('parseTimeEndToMinutes', () => {
    it('mengonversi format baku HH:mm ke total menit', () => {
      expect(parseTimeEndToMinutes('12:00')).toBe(720);
      expect(parseTimeEndToMinutes('06:30')).toBe(390);
    });

    it('mengonversi 24:00 atau midnight pergantian hari ke 1440 menit', () => {
      expect(parseTimeEndToMinutes('24:00')).toBe(1440);
      expect(parseTimeEndToMinutes('24:00:00')).toBe(1440);
      expect(parseTimeEndToMinutes('00:00', 18 * 60)).toBe(1440);
    });
  });

  describe('validateSessionDefsNonOverlap', () => {
    it('lolos jika seluruh shift berkesinambungan dan non-overlapping (00:00-06:00, 06:00-12:00, 12:00-18:00, 18:00-24:00)', () => {
      const defs = [
        { code: 'early_morning', label: 'Dini Hari', startsAt: '00:00:00', endsAt: '06:00:00', isActive: true, sortOrder: 1 },
        { code: 'morning', label: 'Pagi', startsAt: '06:00:00', endsAt: '12:00:00', isActive: true, sortOrder: 2 },
        { code: 'afternoon', label: 'Siang', startsAt: '12:00:00', endsAt: '18:00:00', isActive: true, sortOrder: 3 },
        { code: 'night', label: 'Malam', startsAt: '18:00:00', endsAt: '24:00:00', isActive: true, sortOrder: 4 },
      ];

      expect(() => validateSessionDefsNonOverlap(defs)).not.toThrow();
    });

    it('lolos jika terdapat jeda operasional yang sah (misal Pagi selesai 10:00 dan Siang mulai 12:00)', () => {
      const defs = [
        { code: 'morning', label: 'Pagi', startsAt: '06:00:00', endsAt: '10:00:00', isActive: true, sortOrder: 1 },
        { code: 'afternoon', label: 'Siang', startsAt: '12:00:00', endsAt: '18:00:00', isActive: true, sortOrder: 2 },
      ];

      expect(() => validateSessionDefsNonOverlap(defs)).not.toThrow();
    });

    it('melempar BadRequestException jika Pagi selesai 13:00 bertabrakan dengan Siang mulai 12:00', () => {
      const defs = [
        { code: 'morning', label: 'Pagi', startsAt: '06:00:00', endsAt: '13:00:00', isActive: true, sortOrder: 1 },
        { code: 'afternoon', label: 'Siang', startsAt: '12:00:00', endsAt: '18:00:00', isActive: true, sortOrder: 2 },
      ];

      expect(() => validateSessionDefsNonOverlap(defs)).toThrow(BadRequestException);
      try {
        validateSessionDefsNonOverlap(defs);
      } catch (err: any) {
        expect(err.getResponse().code).toBe('SHIFT_OVERLAP_CONFLICT');
        expect(err.getResponse().metadata.overlapMinutes).toBe(60);
      }
    });

    it('melempar BadRequestException jika jam mulai sama atau lebih besar dari jam selesai dalam satu shift', () => {
      const defs = [
        { code: 'morning', label: 'Pagi', startsAt: '14:00:00', endsAt: '10:00:00', isActive: true, sortOrder: 1 },
      ];

      expect(() => validateSessionDefsNonOverlap(defs)).toThrow(BadRequestException);
      try {
        validateSessionDefsNonOverlap(defs);
      } catch (err: any) {
        expect(err.getResponse().code).toBe('INVALID_SHIFT_TIME_RANGE');
      }
    });

    it('mengabaikan shift yang sedang dinonaktifkan (isActive = false)', () => {
      const defs = [
        { code: 'morning', label: 'Pagi', startsAt: '06:00:00', endsAt: '14:00:00', isActive: true, sortOrder: 1 },
        { code: 'afternoon', label: 'Siang', startsAt: '12:00:00', endsAt: '18:00:00', isActive: false, sortOrder: 2 },
      ];

      expect(() => validateSessionDefsNonOverlap(defs)).not.toThrow();
    });
  });

  describe('validateWeeklyTemplatesNonOverlap', () => {
    it('melempar BadRequestException jika dua shift aktif pada hari yang sama bertabrakan', () => {
      const templates = [
        { sessionId: 'uuid-1', dow: 1, startsAt: '08:00:00', endsAt: '13:00:00', isActive: true },
        { sessionId: 'uuid-2', dow: 1, startsAt: '12:00:00', endsAt: '17:00:00', isActive: true },
      ];

      expect(() => validateWeeklyTemplatesNonOverlap(templates)).toThrow(BadRequestException);
    });

    it('lolos jika shift pada hari berbeda saling beririsan jam (karena beda hari)', () => {
      const templates = [
        { sessionId: 'uuid-1', dow: 1, startsAt: '08:00:00', endsAt: '13:00:00', isActive: true },
        { sessionId: 'uuid-2', dow: 2, startsAt: '12:00:00', endsAt: '17:00:00', isActive: true },
      ];

      expect(() => validateWeeklyTemplatesNonOverlap(templates)).not.toThrow();
    });
  });
});

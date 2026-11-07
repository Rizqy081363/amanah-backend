import { describe, expect, it } from 'bun:test';
import {
  CreateMaternityIntakeSchema,
  UpdateMaternityIntakeSchema,
} from './update-intake.schema';

describe('Maternity Intake Zod Schema - NIK Uniqueness', () => {
  it('should reject when motherNik and partnerNik are identical in CreateMaternityIntakeSchema', () => {
    const payload = {
      patientId: '11111111-1111-4111-a111-111111111111',
      motherName: 'Ny. Siti Rahmawati',
      motherNik: '3201234567890001',
      partnerNik: '3201234567890001',
      currentComplaints: 'Pemeriksaan rutin trimester 1',
      gravidaCount: 1,
      parityCount: 0,
      abortionCount: 0,
      livingChildrenCount: 0,
    };

    const parsed = CreateMaternityIntakeSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const partnerNikError = parsed.error.issues.find(
        (i) => i.path.includes('partnerNik'),
      );
      expect(partnerNikError?.message).toBe(
        'NIK Suami tidak boleh sama dengan NIK Ibu',
      );
    }
  });

  it('should reject when motherNik and husband.nik are identical in CreateMaternityIntakeSchema', () => {
    const payload = {
      patientId: '11111111-1111-4111-a111-111111111111',
      motherName: 'Ny. Siti Rahmawati',
      motherNik: '3201234567890001',
      husband: {
        nik: '3201234567890001',
      },
      currentComplaints: 'Pemeriksaan rutin trimester 1',
      gravidaCount: 1,
      parityCount: 0,
      abortionCount: 0,
      livingChildrenCount: 0,
    };

    const parsed = CreateMaternityIntakeSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const partnerNikError = parsed.error.issues.find(
        (i) => i.path.includes('partnerNik'),
      );
      expect(partnerNikError?.message).toBe(
        'NIK Suami tidak boleh sama dengan NIK Ibu',
      );
    }
  });

  it('should pass when motherNik and partnerNik are different in CreateMaternityIntakeSchema', () => {
    const payload = {
      patientId: '11111111-1111-4111-a111-111111111111',
      motherName: 'Ny. Siti Rahmawati',
      motherNik: '3201234567890001',
      partnerNik: '3201234567890002',
      currentComplaints: 'Pemeriksaan rutin trimester 1',
      gravidaCount: 1,
      parityCount: 0,
      abortionCount: 0,
      livingChildrenCount: 0,
    };

    const parsed = CreateMaternityIntakeSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('should reject when motherNik and partnerNik are identical in UpdateMaternityIntakeSchema', () => {
    const payload = {
      motherNik: '3201234567890001',
      partnerNik: '3201234567890001',
    };

    const parsed = UpdateMaternityIntakeSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const partnerNikError = parsed.error.issues.find(
        (i) => i.path.includes('partnerNik'),
      );
      expect(partnerNikError?.message).toBe(
        'NIK Suami tidak boleh sama dengan NIK Ibu',
      );
    }
  });

  it('should pass when updating only one NIK or when NIKs are distinct in UpdateMaternityIntakeSchema', () => {
    const payload = {
      motherNik: '3201234567890001',
      partnerNik: '3201234567890002',
    };

    const parsed = UpdateMaternityIntakeSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });
});

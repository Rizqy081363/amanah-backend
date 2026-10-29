import { describe, expect, it } from 'bun:test';
import { createRequestLeaveSchema } from './request-leave.schema';

describe('RequestLeaveSchema (Forward-Only Date & Scope Validation)', () => {
  const TODAY = '2026-10-29';
  const schema = createRequestLeaveSchema(TODAY);

  const validBasePayload = {
    startDate: '2026-10-30',
    endDate: '2026-10-30',
    scope: 'full_day' as const,
    reason: 'Keperluan keluarga mendesak',
    type: 'annual_leave' as const,
  };

  it('accepts valid future leave dates for full_day scope', () => {
    const result = schema.safeParse(validBasePayload);
    expect(result.success).toBe(true);
  });

  it('accepts leave starting exactly today', () => {
    const result = schema.safeParse({
      ...validBasePayload,
      startDate: TODAY,
      endDate: TODAY,
    });
    expect(result.success).toBe(true);
  });

  it('rejects past start dates before minAllowedDate', () => {
    const result = schema.safeParse({
      ...validBasePayload,
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('startDate'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('tidak boleh di masa lalu');
    }
  });

  it('rejects inverted date ranges (endDate < startDate)', () => {
    const result = schema.safeParse({
      ...validBasePayload,
      startDate: '2026-11-05',
      endDate: '2026-11-02',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('endDate'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('tidak boleh mendahului tanggal awal');
    }
  });

  it('rejects session scope when sessionIds is missing or empty', () => {
    const result = schema.safeParse({
      ...validBasePayload,
      scope: 'session',
      sessionIds: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('sessionIds'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Sesi praktik harus dipilih');
    }
  });

  it('rejects session scope spanning across multiple days', () => {
    const result = schema.safeParse({
      ...validBasePayload,
      startDate: '2026-10-30',
      endDate: '2026-10-31',
      scope: 'session',
      sessionIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('endDate'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('hanya berlaku untuk 1 hari kerja yang sama');
    }
  });

  it('accepts valid session scope on a single day with valid UUIDs', () => {
    const result = schema.safeParse({
      ...validBasePayload,
      startDate: '2026-10-30',
      endDate: '2026-10-30',
      scope: 'session',
      sessionIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
    });
    expect(result.success).toBe(true);
  });
});

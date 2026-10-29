import { describe, expect, it } from 'bun:test';

/**
 * Pure domain logic test for leave overlap detection and clinic period policies.
 * Replicates the exact formulas enforced in LeaveDrizzleRepository.create.
 */

interface ExistingLeave {
  id: string;
  startDate: string;
  endDate: string;
  scope: 'session' | 'full_day';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  sessionIds?: string[];
}

function checkDateRangeOverlap(
  existing: ExistingLeave,
  newReq: { startDate: string; endDate: string },
): boolean {
  return existing.startDate <= newReq.endDate && existing.endDate >= newReq.startDate;
}

function checkLeaveConflict(
  existingList: ExistingLeave[],
  newReq: {
    startDate: string;
    endDate: string;
    scope: 'session' | 'full_day';
    sessionIds?: string[];
  },
  policy: 'non_overlapping' | 'previous_period_must_finish',
  todayStr: string,
): { isConflict: boolean; reason?: string } {
  const blockingStatuses = new Set(['pending', 'approved']);

  // Policy B: Previous period must finish first
  if (policy === 'previous_period_must_finish') {
    const activeOrFutureLeaves = existingList.filter(
      (e) => blockingStatuses.has(e.status) && e.endDate >= todayStr,
    );
    if (activeOrFutureLeaves.length > 0) {
      const latest = activeOrFutureLeaves[0];
      return {
        isConflict: true,
        reason: `Kebijakan klinik mewajibkan masa periode cuti sebelumnya (${latest.startDate} s/d ${latest.endDate}) selesai terlebih dahulu sebelum dapat mengajukan permohonan izin baru.`,
      };
    }
  }

  // Overlap checks across active/blocking requests
  for (const existing of existingList) {
    if (!blockingStatuses.has(existing.status)) {
      continue; // rejected and cancelled do not block
    }

    if (!checkDateRangeOverlap(existing, newReq)) {
      continue;
    }

    let isConflicting = false;
    if (existing.scope === 'full_day' || newReq.scope === 'full_day') {
      isConflicting = true;
    } else if (existing.scope === 'session' && newReq.scope === 'session') {
      const newSessionSet = new Set(newReq.sessionIds || []);
      const existingSessionIds = existing.sessionIds || [];
      const hasShared = existingSessionIds.some((id) => newSessionSet.has(id));
      if (hasShared) {
        isConflicting = true;
      }
    }

    if (isConflicting) {
      const statusLabel =
        existing.status === 'pending'
          ? 'menunggu persetujuan (pending)'
          : 'telah disetujui';
      return {
        isConflict: true,
        reason: `Anda memiliki permohonan izin yang ${statusLabel} pada rentang tanggal/sesi tersebut (${existing.startDate} s/d ${existing.endDate}).`,
      };
    }
  }

  return { isConflict: false };
}

describe('Leave Overlap & Clinic Period Policy Engine', () => {
  const TODAY = '2026-10-29';

  const pendingOct30_31: ExistingLeave = {
    id: 'leave-1',
    startDate: '2026-10-30',
    endDate: '2026-10-31',
    scope: 'full_day',
    status: 'pending',
  };

  const approvedNov1_30: ExistingLeave = {
    id: 'leave-2',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    scope: 'full_day',
    status: 'approved',
  };

  const rejectedLeave: ExistingLeave = {
    id: 'leave-3',
    startDate: '2026-10-30',
    endDate: '2026-10-31',
    scope: 'full_day',
    status: 'rejected',
  };

  const cancelledLeave: ExistingLeave = {
    id: 'leave-4',
    startDate: '2026-10-30',
    endDate: '2026-10-31',
    scope: 'full_day',
    status: 'cancelled',
  };

  it('Scenario A: blocks exact duplicate pending request', () => {
    const result = checkLeaveConflict(
      [pendingOct30_31],
      { startDate: '2026-10-30', endDate: '2026-10-31', scope: 'full_day' },
      'non_overlapping',
      TODAY,
    );
    expect(result.isConflict).toBe(true);
    expect(result.reason).toContain('menunggu persetujuan (pending)');
  });

  it('Scenario B: blocks sub-interval date request against pending range (30-31 vs 31)', () => {
    const result = checkLeaveConflict(
      [pendingOct30_31],
      { startDate: '2026-10-31', endDate: '2026-10-31', scope: 'full_day' },
      'non_overlapping',
      TODAY,
    );
    expect(result.isConflict).toBe(true);
    expect(result.reason).toContain('menunggu persetujuan (pending)');
  });

  it('Scenario C: blocks date inside full-month approved range (Nov 1-30 vs Nov 12)', () => {
    const result = checkLeaveConflict(
      [approvedNov1_30],
      { startDate: '2026-11-12', endDate: '2026-11-12', scope: 'full_day' },
      'non_overlapping',
      TODAY,
    );
    expect(result.isConflict).toBe(true);
    expect(result.reason).toContain('telah disetujui');
  });

  it('Scenario D: allows non-overlapping future period under flexible policy (non_overlapping)', () => {
    const result = checkLeaveConflict(
      [pendingOct30_31],
      { startDate: '2026-11-05', endDate: '2026-11-06', scope: 'full_day' },
      'non_overlapping',
      TODAY,
    );
    expect(result.isConflict).toBe(false);
  });

  it('Scenario E: rejects non-overlapping future period under strict policy (previous_period_must_finish)', () => {
    const result = checkLeaveConflict(
      [pendingOct30_31],
      { startDate: '2026-11-05', endDate: '2026-11-06', scope: 'full_day' },
      'previous_period_must_finish',
      TODAY,
    );
    expect(result.isConflict).toBe(true);
    expect(result.reason).toContain('selesai terlebih dahulu');
  });

  it('Scenario F: permits future period under strict policy if previous leave has already ended in the past', () => {
    const pastLeave: ExistingLeave = {
      id: 'leave-past',
      startDate: '2026-10-20',
      endDate: '2026-10-25',
      scope: 'full_day',
      status: 'approved',
    };
    const result = checkLeaveConflict(
      [pastLeave],
      { startDate: '2026-11-05', endDate: '2026-11-06', scope: 'full_day' },
      'previous_period_must_finish',
      TODAY, // TODAY is 2026-10-29, which is > 2026-10-25
    );
    expect(result.isConflict).toBe(false);
  });

  it('Scenario G: rejected and cancelled leaves do not block new requests on the same dates', () => {
    const result1 = checkLeaveConflict(
      [rejectedLeave],
      { startDate: '2026-10-30', endDate: '2026-10-31', scope: 'full_day' },
      'non_overlapping',
      TODAY,
    );
    expect(result1.isConflict).toBe(false);

    const result2 = checkLeaveConflict(
      [cancelledLeave],
      { startDate: '2026-10-30', endDate: '2026-10-31', scope: 'full_day' },
      'non_overlapping',
      TODAY,
    );
    expect(result2.isConflict).toBe(false);
  });

  it('Scenario H: session-level disambiguation allows disjoint sessions on the same date', () => {
    const sessionMorning: ExistingLeave = {
      id: 'leave-sess-1',
      startDate: '2026-10-30',
      endDate: '2026-10-30',
      scope: 'session',
      status: 'pending',
      sessionIds: ['session-uuid-pagi'],
    };

    // Requesting evening session on the same date -> permitted
    const resultDisjoint = checkLeaveConflict(
      [sessionMorning],
      {
        startDate: '2026-10-30',
        endDate: '2026-10-30',
        scope: 'session',
        sessionIds: ['session-uuid-sore'],
      },
      'non_overlapping',
      TODAY,
    );
    expect(resultDisjoint.isConflict).toBe(false);

    // Requesting morning session on the same date -> blocked
    const resultShared = checkLeaveConflict(
      [sessionMorning],
      {
        startDate: '2026-10-30',
        endDate: '2026-10-30',
        scope: 'session',
        sessionIds: ['session-uuid-pagi'],
      },
      'non_overlapping',
      TODAY,
    );
    expect(resultShared.isConflict).toBe(true);

    // Requesting full_day on the same date -> blocked (full_day covers all sessions)
    const resultFullDay = checkLeaveConflict(
      [sessionMorning],
      {
        startDate: '2026-10-30',
        endDate: '2026-10-30',
        scope: 'full_day',
      },
      'non_overlapping',
      TODAY,
    );
    expect(resultFullDay.isConflict).toBe(true);
  });
});

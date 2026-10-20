import { describe, expect, it, mock } from 'bun:test';
import { ForbiddenException } from '@nestjs/common';
import { ReplacementsController } from './replacements.controller';
import type { ReplacementRepository } from '../domain/repositories/replacement.repository';
import { ReplacementOpportunityEntity } from '../domain/entities/replacement-opportunity.entity';

describe('ReplacementsController', () => {
  const mockRepo: ReplacementRepository = {
    findOpportunities: mock(async (filters) => {
      const opp = new ReplacementOpportunityEntity();
      opp.id = 'opp-1';
      opp.workDate = '2026-10-20';
      opp.status = filters?.status === 'claimed' ? 'claimed' : 'open';
      opp.originalStaffName = 'dr. Ahmad Santoso';
      opp.originalStaffRole = 'Dokter Umum';
      opp.originalStaffAvatarUrl = 'https://example.com/avatar.jpg';
      opp.startTime = '06:00:00';
      opp.endTime = '12:00:00';
      opp.leaveReason = 'Keperluan keluarga mendesak';
      opp.claimedByName = filters?.status === 'claimed' ? 'dr. Maya Putri' : null;
      opp.claimedByRole = filters?.status === 'claimed' ? 'Dokter Umum' : null;
      opp.claimedByAvatarUrl = null;
      return [opp];
    }),
    findOpenOpportunities: mock(async () => []),
    findByLeaveRequestId: mock(async () => []),
    claimOpportunity: mock(async (id, staffId, practitionerId) => {
      const opp = new ReplacementOpportunityEntity();
      opp.id = id;
      opp.status = 'claimed';
      opp.claimedByStaffProfileId = staffId;
      opp.claimedByPractitionerId = practitionerId;
      return opp;
    }),
    createOpportunity: mock(async () => new ReplacementOpportunityEntity()),
  };

  const controller = new ReplacementsController(mockRepo);

  it('delegates getOpportunities with date and status parameters to repository', async () => {
    const results = await controller.getOpportunities('2026-10-20', 'claimed');
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('claimed');
    expect(results[0].claimedByName).toBe('dr. Maya Putri');
    expect(mockRepo.findOpportunities).toHaveBeenCalledWith({
      date: '2026-10-20',
      status: 'claimed',
    });
  });

  it('rejects claimOpportunity when caller is not a registered staff member', async () => {
    expect(
      controller.claimOpportunity('opp-1', { user: { id: 'user-without-staff' } }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows claimOpportunity for registered staff and passes practitionerId when present', async () => {
    const user = {
      staff: { id: 'staff-123' },
      doctor: { id: 'prac-456' },
    };

    const res = await controller.claimOpportunity('opp-1', user);
    expect(res.id).toBe('opp-1');
    expect(res.status).toBe('claimed');
    expect(res.claimedByStaffProfileId).toBe('staff-123');
    expect(res.claimedByPractitionerId).toBe('prac-456');
  });
});

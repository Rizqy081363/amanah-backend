import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { UnauthorizedException } from '@nestjs/common';
import { RealtimeTicketController } from './realtime-ticket.controller';

describe('RealtimeTicketController', () => {
  let controller: RealtimeTicketController;
  let mockTicketService: any;

  beforeEach(() => {
    mockTicketService = {
      createTicket: mock().mockResolvedValue({
        ticket: 'mock-ticket-token-123',
        expiresInSec: 60,
      }),
    };

    controller = new RealtimeTicketController(mockTicketService);
  });

  it('should issue ticket for authenticated user', async () => {
    const user = {
      id: 'user-abc',
      role: 'admin',
    };

    const result = await controller.issueTicket(user);
    expect(result).toEqual({
      ticket: 'mock-ticket-token-123',
      expiresInSec: 60,
    });
    expect(mockTicketService.createTicket).toHaveBeenCalledWith('user-abc', 'admin');
  });

  it('should throw UnauthorizedException if user has no id', async () => {
    expect(controller.issueTicket(null)).rejects.toThrow(UnauthorizedException);
    expect(controller.issueTicket({})).rejects.toThrow(UnauthorizedException);
  });
});

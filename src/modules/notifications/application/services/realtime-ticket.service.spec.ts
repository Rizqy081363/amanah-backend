import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { RealtimeTicketService } from './realtime-ticket.service';

describe('RealtimeTicketService', () => {
  let service: RealtimeTicketService;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      set: mock().mockResolvedValue('OK'),
      eval: mock().mockImplementation(async (script: string, numKeys: number, key: string) => {
        return null;
      }),
    };
  });

  describe('with in-memory fallback', () => {
    beforeEach(() => {
      service = new RealtimeTicketService(undefined);
    });

    it('should create and atomically consume ticket once', async () => {
      const { ticket, expiresInSec } = await service.createTicket('user-123', 'admin');

      expect(ticket).toBeDefined();
      expect(typeof ticket).toBe('string');
      expect(expiresInSec).toBe(60);

      // First consumption succeeds
      const consumed = await service.consumeTicket(ticket);
      expect(consumed).toEqual({ userId: 'user-123', role: 'admin' });

      // Second consumption must return null (single use)
      const secondConsume = await service.consumeTicket(ticket);
      expect(secondConsume).toBeNull();
    });

    it('should reject invalid or non-existent ticket', async () => {
      const consumed = await service.consumeTicket('non-existent-ticket');
      expect(consumed).toBeNull();
    });
  });

  describe('with Redis client', () => {
    beforeEach(() => {
      service = new RealtimeTicketService(mockRedis);
    });

    it('should store ticket in Redis with 60s TTL', async () => {
      const { ticket, expiresInSec } = await service.createTicket('user-456', 'staff_worker');

      expect(ticket).toBeDefined();
      expect(expiresInSec).toBe(60);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('should consume ticket atomically from Redis via lua script', async () => {
      const samplePayload = JSON.stringify({
        userId: 'user-456',
        role: 'staff_worker',
        issuedAt: Date.now(),
      });
      mockRedis.eval.mockResolvedValueOnce(samplePayload);

      const result = await service.consumeTicket('valid-ticket-string');
      expect(result).toEqual({ userId: 'user-456', role: 'staff_worker' });
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    });
  });
});

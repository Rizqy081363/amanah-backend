import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../common/redis/redis.constants';
import type {
  RealtimePrincipal,
  RealtimeTicketPayload,
} from '../../contracts/realtime-session.contract';

export interface RealtimeTicketResult {
  ticket: string;
  expiresInSec: number;
}

@Injectable()
export class RealtimeTicketService {
  private readonly logger = new Logger(RealtimeTicketService.name);
  private static readonly TICKET_TTL_SECONDS = 60;
  private static readonly KEY_PREFIX = 'rt:ticket:';

  // In-memory fallback if Redis is not configured or in unit test environment
  private readonly memoryTickets = new Map<
    string,
    { data: RealtimeTicketPayload; expiresAt: number }
  >();

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient?: Redis,
  ) {}

  /**
   * Generates a single-use opaque CSPRNG ticket for WebSocket handshake.
   * Stores sha256(ticket) in Redis with 60s TTL.
   */
  async createTicket(
    principal: RealtimePrincipal,
  ): Promise<RealtimeTicketResult> {
    const rawTicket = randomBytes(32).toString('base64url');
    const ticketHash = this.hashTicket(rawTicket);
    const key = `${RealtimeTicketService.KEY_PREFIX}${ticketHash}`;

    const payload: RealtimeTicketPayload = {
      userId: principal.userId,
      roleCode: principal.roleCode,
      roles: principal.roles,
      issuedAt: Date.now(),
    };

    if (this.redisClient && typeof this.redisClient.set === 'function') {
      try {
        await this.redisClient.set(
          key,
          JSON.stringify(payload),
          'EX',
          RealtimeTicketService.TICKET_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.warn(
          `Redis error setting realtime ticket for user ${principal.userId}, falling back to memory: ${err}`,
        );
        this.memoryTickets.set(ticketHash, {
          data: payload,
          expiresAt:
            Date.now() + RealtimeTicketService.TICKET_TTL_SECONDS * 1000,
        });
      }
    } else {
      this.memoryTickets.set(ticketHash, {
        data: payload,
        expiresAt: Date.now() + RealtimeTicketService.TICKET_TTL_SECONDS * 1000,
      });
    }

    return {
      ticket: rawTicket,
      expiresInSec: RealtimeTicketService.TICKET_TTL_SECONDS,
    };
  }

  /**
   * Atomically consumes a ticket via GETDEL (or Lua script).
   * Ensures single-use: once consumed, subsequent attempts return null.
   */
  async consumeTicket(ticket: string): Promise<RealtimePrincipal | null> {
    if (!ticket || typeof ticket !== 'string') {
      return null;
    }

    const ticketHash = this.hashTicket(ticket.trim());
    const key = `${RealtimeTicketService.KEY_PREFIX}${ticketHash}`;

    if (this.redisClient && typeof this.redisClient.eval === 'function') {
      try {
        // Atomic GET and DEL via Lua script (compatible with all Redis versions)
        const luaScript = `
          local val = redis.call('GET', KEYS[1])
          if val then
            redis.call('DEL', KEYS[1])
          end
          return val
        `;
        const result = await this.redisClient.eval(luaScript, 1, key);

        if (typeof result === 'string' && result.length > 0) {
          const parsed = JSON.parse(result) as RealtimeTicketPayload;
          return {
            userId: parsed.userId,
            roleCode: parsed.roleCode,
            roles: parsed.roles,
          };
        }
        return null;
      } catch (err) {
        this.logger.warn(`Redis eval error during ticket consumption: ${err}`);
      }
    }

    // Fallback: check memory store
    const entry = this.memoryTickets.get(ticketHash);
    if (!entry) {
      return null;
    }

    // Single use: delete immediately
    this.memoryTickets.delete(ticketHash);

    if (Date.now() > entry.expiresAt) {
      return null; // Expired
    }

    return {
      userId: entry.data.userId,
      roleCode: entry.data.roleCode,
      roles: entry.data.roles,
    };
  }

  private hashTicket(ticket: string): string {
    return createHash('sha256').update(ticket).digest('hex');
  }
}

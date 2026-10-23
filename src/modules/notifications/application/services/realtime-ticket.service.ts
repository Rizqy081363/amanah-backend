import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../common/redis/redis.constants';

export interface RealtimeTicketData {
  userId: string;
  role: string;
  roles?: string[];
  issuedAt: number;
}

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
    { data: RealtimeTicketData; expiresAt: number }
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
    userId: string,
    role = 'patient',
    roles: string[] = [],
  ): Promise<RealtimeTicketResult> {
    const rawTicket = randomBytes(32).toString('base64url');
    const ticketHash = this.hashTicket(rawTicket);
    const key = `${RealtimeTicketService.KEY_PREFIX}${ticketHash}`;

    const normalizedRoles =
      Array.isArray(roles) && roles.length > 0 ? roles : [role];

    const payload: RealtimeTicketData = {
      userId,
      role,
      roles: normalizedRoles,
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
          `Redis error setting realtime ticket for user ${userId}, falling back to memory: ${err}`,
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
  async consumeTicket(
    ticket: string,
  ): Promise<{ userId: string; role: string; roles?: string[] } | null> {
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
          const parsed = JSON.parse(result) as RealtimeTicketData;
          return {
            userId: parsed.userId,
            role: parsed.role,
            roles: parsed.roles || [parsed.role],
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
      role: entry.data.role,
      roles: entry.data.roles || [entry.data.role],
    };
  }

  private hashTicket(ticket: string): string {
    return createHash('sha256').update(ticket).digest('hex');
  }
}

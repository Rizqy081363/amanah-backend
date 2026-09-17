import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
  IDEMPOTENT_METADATA_KEY,
  IdempotencyOptions,
} from '../decorators/idempotent.decorator';
import { RedisService } from '../redis/redis.service';

interface IdempotencyRecord {
  status: 'IN_PROGRESS' | 'COMPLETED';
  payloadHash: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
  createdAt: string;
  completedAt?: string;
}

const DEFAULT_RETENTION_TTL_SECONDS = 86400; // 24 hours (API-143)
const DEFAULT_LOCK_TTL_SECONDS = 60; // 60 seconds (API-144)
const DEFAULT_CONCURRENCY_WAIT_MS = 1500; // 1.5s bounded wait for in-flight requests (API-144)
const CONCURRENCY_POLL_INTERVAL_MS = 100;
const MAX_KEY_LENGTH = 128;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    const options =
      this.reflector.getAllAndOverride<IdempotencyOptions>(
        IDEMPOTENT_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      ) || {};

    const rawKey =
      req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    // Strict requirement validation
    if (options.required && !idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'An Idempotency-Key header is required for this endpoint.',
      });
    }

    // Only apply idempotency when key is present on state-changing methods
    const method = req.method.toUpperCase();
    const isStateChanging = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    if (!idempotencyKey || !isStateChanging) {
      return next.handle();
    }

    // Validate key bounds and format
    const trimmedKey = idempotencyKey.trim();
    if (trimmedKey.length === 0 || trimmedKey.length > MAX_KEY_LENGTH) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: `Idempotency-Key must be between 1 and ${MAX_KEY_LENGTH} characters.`,
      });
    }

    // Scope to caller and endpoint (API-140)
    const callerId = this.extractCallerId(req);
    const path = req.path || req.url?.split('?')[0] || '/';
    const redisKey = `idempotency:${encodeURIComponent(callerId)}:${method}:${encodeURIComponent(path)}:${trimmedKey}`;

    // Deterministic payload hash across body and query (API-142)
    const payloadHash = this.computePayloadHash(req.body, req.query);

    const ttl = options.ttl ?? DEFAULT_RETENTION_TTL_SECONDS;
    const lockTtl = options.lockTtl ?? DEFAULT_LOCK_TTL_SECONDS;
    const concurrencyWaitMs =
      options.concurrencyWaitMs ?? DEFAULT_CONCURRENCY_WAIT_MS;

    const initialRecord: IdempotencyRecord = {
      status: 'IN_PROGRESS',
      payloadHash,
      createdAt: new Date().toISOString(),
    };

    let acquired = false;
    try {
      acquired = await this.redisService.setNx(
        redisKey,
        JSON.stringify(initialRecord),
        lockTtl,
      );
    } catch (err) {
      // Fail-safe graceful degradation (ARC-004): do not fail request if cache storage errors
      this.logger.error(
        `Redis error during idempotency acquisition for key "${redisKey}": ${String(err)}`,
      );
      return next.handle();
    }

    if (!acquired) {
      const existingRaw = await this.redisService.getString(redisKey);
      if (existingRaw) {
        let existingRecord: IdempotencyRecord | null = null;
        try {
          existingRecord = JSON.parse(existingRaw);
        } catch {
          await this.redisService.delete(redisKey);
          return next.handle();
        }

        // Mismatched payload check (API-142)
        if (existingRecord && existingRecord.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
            message:
              'The idempotency key has already been used with a different request payload.',
          });
        }

        // Concurrent execution handling: bounded wait (API-144)
        if (existingRecord && existingRecord.status === 'IN_PROGRESS') {
          existingRecord = await this.waitForConcurrentExecution(
            redisKey,
            concurrencyWaitMs,
          );
        }

        // If request finished during wait window, replay result (API-141)
        if (existingRecord && existingRecord.status === 'COMPLETED') {
          if (existingRecord.payloadHash !== payloadHash) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
              message:
                'The idempotency key has already been used with a different request payload.',
            });
          }
          return this.replayResponse(res, existingRecord);
        }

        // If still in-progress after bounded wait, emit retry signal (API-144)
        if (existingRecord && existingRecord.status === 'IN_PROGRESS') {
          res.setHeader('Retry-After', '2');
          throw new ConflictException({
            code: 'IDEMPOTENCY_REQUEST_IN_FLIGHT',
            message:
              'A request with this idempotency key is currently in progress. Please retry shortly.',
          });
        }
      }
    }

    // Active executor: proceed with handler and record result
    return next.handle().pipe(
      tap(async (responseBody) => {
        const statusCode = res.statusCode || 200;
        if (statusCode >= 200 && statusCode < 300) {
          const headersToSave: Record<string, string> = {};
          const locationHeader = res.getHeader('Location');
          if (typeof locationHeader === 'string') {
            headersToSave.location = locationHeader;
          }

          const completedRecord: IdempotencyRecord = {
            status: 'COMPLETED',
            payloadHash,
            statusCode,
            headers: headersToSave,
            body: responseBody,
            createdAt: initialRecord.createdAt,
            completedAt: new Date().toISOString(),
          };

          await this.redisService.setString(
            redisKey,
            JSON.stringify(completedRecord),
            ttl,
          );
        } else {
          await this.redisService.delete(redisKey);
        }
      }),
      catchError((error) => {
        this.redisService.delete(redisKey).catch((delError) => {
          this.logger.warn(
            `Failed to cleanup idempotency lock for key "${redisKey}": ${delError.message}`,
          );
        });
        return throwError(() => error);
      }),
    );
  }

  private extractCallerId(req: Request): string {
    const user = (req as any).user;
    if (user) {
      if (user.id) return String(user.id);
      if (user.sub) return String(user.sub);
      if (user.userId) return String(user.userId);
    }

    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
      return forwarded.split(',')[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || 'anonymous';
  }

  private computePayloadHash(body: unknown, query?: unknown): string {
    const payloadToHash = {
      body: body ?? {},
      query: query ?? {},
    };
    const serialized = this.deterministicStringify(payloadToHash);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  private deterministicStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.deterministicStringify(item)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const parts = sortedKeys.map(
      (k) => `${JSON.stringify(k)}:${this.deterministicStringify(record[k])}`,
    );
    return `{${parts.join(',')}}`;
  }

  private async waitForConcurrentExecution(
    key: string,
    timeoutMs: number,
  ): Promise<IdempotencyRecord | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONCURRENCY_POLL_INTERVAL_MS),
      );
      const raw = await this.redisService.getString(key);
      if (!raw) {
        return null;
      }
      try {
        const record: IdempotencyRecord = JSON.parse(raw);
        if (record.status === 'COMPLETED') {
          return record;
        }
      } catch {
        return null;
      }
    }

    const finalRaw = await this.redisService.getString(key);
    if (!finalRaw) return null;
    try {
      return JSON.parse(finalRaw);
    } catch {
      return null;
    }
  }

  private replayResponse(
    res: Response,
    record: IdempotencyRecord,
  ): Observable<unknown> {
    const replayStatus = record.statusCode || 200;
    res.status(replayStatus);
    res.setHeader('Idempotent-Replay', 'true');
    res.setHeader('X-Cache-Lookup', 'HIT');

    if (record.headers?.location) {
      res.setHeader('Location', record.headers.location);
    }

    return of(record.body);
  }
}

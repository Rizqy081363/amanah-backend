import * as crypto from 'crypto';
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
  body?: unknown;
  createdAt: string;
  completedAt?: string;
}

const DEFAULT_RETENTION_TTL_SECONDS = 86400; // 24 hours (API-143)
const DEFAULT_LOCK_TTL_SECONDS = 60; // 60 seconds (API-144)
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

    // If endpoint strictly requires idempotency key
    if (options.required && !idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'An Idempotency-Key header is required for this endpoint.',
      });
    }

    // Only apply idempotency when key is present and method is state-changing
    const method = req.method.toUpperCase();
    const isStateChanging = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    if (!idempotencyKey || !isStateChanging) {
      return next.handle();
    }

    // Validate key format and bounds
    const trimmedKey = idempotencyKey.trim();
    if (trimmedKey.length === 0 || trimmedKey.length > MAX_KEY_LENGTH) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: `Idempotency-Key must be between 1 and ${MAX_KEY_LENGTH} characters.`,
      });
    }

    // Scope to caller and endpoint (API-140)
    const callerId = (req as any).user?.id || req.ip || 'anonymous';
    const path = req.path || req.url?.split('?')[0] || '/';
    const redisKey = `idempotency:${callerId}:${method}:${path}:${trimmedKey}`;

    // Deterministic payload hash (API-142)
    const payloadHash = this.computePayloadHash(req.body);

    const ttl = options.ttl ?? DEFAULT_RETENTION_TTL_SECONDS;
    const lockTtl = options.lockTtl ?? DEFAULT_LOCK_TTL_SECONDS;

    // Atomically attempt to acquire the lock (API-144, API-145)
    const initialRecord: IdempotencyRecord = {
      status: 'IN_PROGRESS',
      payloadHash,
      createdAt: new Date().toISOString(),
    };

    const acquired = await this.redisService.setNx(
      redisKey,
      JSON.stringify(initialRecord),
      lockTtl,
    );

    if (!acquired) {
      // Key already exists - evaluate existing execution state
      const existingRaw = await this.redisService.getString(redisKey);
      if (existingRaw) {
        let existingRecord: IdempotencyRecord;
        try {
          existingRecord = JSON.parse(existingRaw);
        } catch {
          // In case of corrupt JSON, release key and allow re-execution
          await this.redisService.delete(redisKey);
          return next.handle();
        }

        // Mismatched payload conflict check (API-142)
        if (existingRecord.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
            message:
              'The idempotency key has already been used with a different request payload.',
          });
        }

        // In-flight concurrent request check (API-144)
        if (existingRecord.status === 'IN_PROGRESS') {
          res.setHeader('Retry-After', '2');
          throw new ConflictException({
            code: 'IDEMPOTENCY_REQUEST_IN_FLIGHT',
            message:
              'A request with this idempotency key is currently in progress. Please retry shortly.',
          });
        }

        // Successfully completed prior execution replay (API-141)
        if (existingRecord.status === 'COMPLETED') {
          const replayStatus = existingRecord.statusCode || 200;
          res.status(replayStatus);
          res.setHeader('Idempotent-Replay', 'true');
          res.setHeader('X-Cache-Lookup', 'HIT');
          return of(existingRecord.body);
        }
      }
    }

    // First execution: proceed with handler and record result on completion
    return next.handle().pipe(
      tap(async (responseBody) => {
        const statusCode = res.statusCode || 200;
        if (statusCode >= 200 && statusCode < 300) {
          const completedRecord: IdempotencyRecord = {
            status: 'COMPLETED',
            payloadHash,
            statusCode,
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
          // If non-2xx status code occurred, release the lock
          await this.redisService.delete(redisKey);
        }
      }),
      catchError((error) => {
        // If an exception occurs, unlock so the client can retry
        this.redisService.delete(redisKey).catch((delError) => {
          this.logger.warn(
            `Failed to cleanup idempotency lock for key "${redisKey}": ${delError.message}`,
          );
        });
        return throwError(() => error);
      }),
    );
  }

  private computePayloadHash(body: unknown): string {
    const serialized = this.deterministicStringify(body ?? {});
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
}

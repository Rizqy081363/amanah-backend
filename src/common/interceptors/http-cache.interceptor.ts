import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import {
  HTTP_CACHE_METADATA_KEY,
  HttpCacheOptions,
} from '../decorators/http-cache.decorator';
import { RedisService } from '../redis/redis.service';

export interface CachedHttpResponse {
  body: unknown;
  etag: string;
  statusCode: number;
}

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpCacheInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Only cache GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next.handle();
    }

    const options = this.reflector.getAllAndOverride<
      HttpCacheOptions | undefined
    >(HTTP_CACHE_METADATA_KEY, [context.getHandler(), context.getClass()]);

    if (!options) {
      return next.handle();
    }

    const ttlSeconds = options.ttlSeconds ?? 60;
    const isPrivate = options.isPrivate ?? false;
    const tags = options.tags ?? [];

    const cacheKey = this.buildCacheKey(req, isPrivate);

    // Set standard cache control and vary headers (API-149..154)
    const cacheControlValue = isPrivate
      ? 'private, no-cache'
      : `public, max-age=${ttlSeconds}, must-revalidate`;
    const varyValue = isPrivate ? 'Accept, Authorization' : 'Accept';

    try {
      const cached =
        await this.redisService.getJson<CachedHttpResponse>(cacheKey);

      if (cached) {
        res.setHeader('X-Cache-Lookup', 'HIT');
        res.setHeader('Cache-Control', cacheControlValue);
        res.setHeader('Vary', varyValue);
        res.setHeader('ETag', cached.etag);

        // Conditional GET check: 304 Not Modified (API-153)
        const clientEtag = req.headers['if-none-match'];
        if (clientEtag && clientEtag === cached.etag) {
          res.status(304);
          return of(undefined);
        }

        res.status(cached.statusCode || 200);
        return of(cached.body);
      }
    } catch (err) {
      this.logger.warn(
        `Redis cache lookup error for "${cacheKey}", falling through: ${String(
          err,
        )}`,
      );
    }

    // Cache MISS: execute handler and store result
    res.setHeader('X-Cache-Lookup', 'MISS');
    res.setHeader('Cache-Control', cacheControlValue);
    res.setHeader('Vary', varyValue);

    return next.handle().pipe(
      mergeMap(async (body) => {
        const statusCode = res.statusCode || 200;
        if (statusCode >= 200 && statusCode < 300 && body !== undefined) {
          const etag = this.generateETag(body);
          res.setHeader('ETag', etag);

          try {
            await this.redisService.setJson(
              cacheKey,
              { body, etag, statusCode },
              ttlSeconds,
            );

            // Index keys by tags for proactive invalidation (API-155)
            for (const tag of tags) {
              await this.redisService.addKeyToTag(tag, cacheKey, ttlSeconds);
            }
          } catch (err) {
            this.logger.warn(
              `Failed to write cache for "${cacheKey}": ${String(err)}`,
            );
          }
        }
        return body;
      }),
    );
  }

  private buildCacheKey(req: Request, isPrivate: boolean): string {
    const rawPath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    const sortedQuery = JSON.stringify(
      Object.keys(req.query || {})
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = req.query[key];
          return acc;
        }, {}),
    );

    if (isPrivate) {
      const user = (req as any).user;
      const callerId = user?.id || user?.sub || 'anon';
      return `httpcache:private:${callerId}:${req.method}:${rawPath}:${sortedQuery}`;
    }

    return `httpcache:public:${req.method}:${rawPath}:${sortedQuery}`;
  }

  private generateETag(body: unknown): string {
    const serialized = typeof body === 'string' ? body : JSON.stringify(body);
    const hash = crypto
      .createHash('sha256')
      .update(serialized)
      .digest('hex')
      .slice(0, 16);
    return `W/"${hash}"`;
  }
}

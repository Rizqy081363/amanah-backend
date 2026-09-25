import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { AllConfigType } from '../../../config/config.type';
import {
  type ClientMetadata,
  extractClientMetadata,
} from '../extractors/client-metadata.extractor';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '../logging.constants';
import { serializeHttpRequest } from '../serializers/http-request.serializer';
import {
  serializeHttpError,
  serializeHttpResponse,
} from '../serializers/http-response.serializer';

@Injectable()
export class HttpObservabilityMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  use(
    req: Request & { correlationId?: string; id?: string; log?: any },
    res: Response,
    next: NextFunction,
  ): void {
    const startTime = Date.now();

    // 1. Resolve Correlation / Request ID consistently
    const rawHeader =
      req.headers[CORRELATION_ID_HEADER] || req.headers[REQUEST_ID_HEADER];
    const correlationId =
      typeof rawHeader === 'string' && rawHeader.trim().length > 0
        ? rawHeader.trim()
        : req.id || req.correlationId || '';

    if (correlationId) {
      req.correlationId = correlationId;
      req.id = correlationId;
      req.headers[CORRELATION_ID_HEADER] = correlationId;
      res.setHeader(CORRELATION_ID_HEADER, correlationId);
    }

    const appConfig = this.configService.get('app', { infer: true });
    const trustProxy = appConfig?.trustProxy ?? false;
    const logRequestBody = appConfig?.httpLogRequestBody ?? true;
    const logResponseBody = appConfig?.httpLogResponseBody ?? true;
    const maxBodyLength = appConfig?.httpLogMaxBodyLength ?? 10000;

    const clientMetadata: ClientMetadata = extractClientMetadata(
      req,
      trustProxy,
    );

    const rawUrl = req.originalUrl || req.url || '/';
    const isHealthEndpoint =
      rawUrl === '/health/live' ||
      rawUrl === '/health/ready' ||
      rawUrl.startsWith('/health');

    const printLog = (
      level: 'debug' | 'info' | 'warn' | 'error',
      payload: unknown,
      eventLabel: string,
    ): void => {
      // If Pino is attached on request, use it directly
      if (req.log && typeof req.log[level] === 'function') {
        req.log[level](payload, eventLabel);
        return;
      }

      // Bun runtime inspector: dump 100% of nested objects and arrays without hiding anything
      if (typeof (globalThis as any).Bun?.inspect === 'function') {
        const formatted = (globalThis as any).Bun.inspect(payload, {
          depth: Infinity,
          maxArrayLength: Infinity,
          colors: process.env.NODE_ENV !== 'production',
        });
        console[level](`${formatted} ${eventLabel}`);
        return;
      }

      // Node.js inspector fallback
      try {
        const util = require('node:util');
        const formatted = util.inspect(payload, {
          depth: null,
          maxArrayLength: null,
          colors: process.env.NODE_ENV !== 'production',
        });
        console[level](`${formatted} ${eventLabel}`);
      } catch {
        console[level](payload, eventLabel);
      }
    };

    // 2. Emit HTTP REQUEST event at arrival
    try {
      const requestPayload = serializeHttpRequest(req, clientMetadata, {
        logBody: logRequestBody,
        maxBodyLength,
      });

      if (isHealthEndpoint) {
        printLog('debug', requestPayload, 'HTTP REQUEST');
      } else {
        printLog('info', requestPayload, 'HTTP REQUEST');
      }
    } catch (err) {
      // Passive observability must never break request pipeline
      printLog(
        'warn',
        { err: String(err) },
        'Failed to serialize incoming HTTP request for logging',
      );
    }

    // 3. Emit HTTP RESPONSE or HTTP ERROR on response finish
    res.on('finish', () => {
      try {
        const durationMs = Date.now() - startTime;
        const statusCode = res.statusCode;

        if (statusCode >= 500) {
          const observedError =
            res.locals?.__observedError ||
            res.locals?.__observedResponseBody ||
            new Error(`HTTP ${statusCode} Server Error`);

          const errorPayload = serializeHttpError({
            req,
            statusCode,
            durationMs,
            error: observedError,
            client: clientMetadata,
            options: {
              includeStack: true,
              maxBodyLength,
            },
          });

          printLog('error', errorPayload, 'HTTP ERROR');
        } else if (statusCode >= 400) {
          const observedError =
            res.locals?.__observedError ||
            res.locals?.__observedResponseBody ||
            new Error(`HTTP ${statusCode} Client Error`);

          const errorPayload = serializeHttpError({
            req,
            statusCode,
            durationMs,
            error: observedError,
            client: clientMetadata,
            options: {
              includeStack: false,
              maxBodyLength,
            },
          });

          printLog('warn', errorPayload, 'HTTP ERROR');
        } else {
          const responsePayload = serializeHttpResponse({
            req,
            res,
            statusCode,
            durationMs,
            responseBody: res.locals?.__observedResponseBody,
            client: clientMetadata,
            options: {
              logBody: logResponseBody,
              maxBodyLength,
              logHeaders: false,
            },
          });

          if (isHealthEndpoint) {
            printLog('debug', responsePayload, 'HTTP RESPONSE');
          } else {
            printLog('info', responsePayload, 'HTTP RESPONSE');
          }
        }
      } catch (err) {
        // Logging failure must never break anything
        printLog(
          'warn',
          { err: String(err) },
          'Failed to serialize HTTP response for logging',
        );
      }
    });

    // 4. Detect aborted / cancelled requests
    res.on('close', () => {
      try {
        if (!res.writableEnded) {
          const durationMs = Date.now() - startTime;
          const abortedPayload = {
            event: 'http.aborted',
            requestId: correlationId,
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.originalUrl || req.url,
            durationMs,
            client: clientMetadata,
          };
          printLog('warn', abortedPayload, 'HTTP ABORTED');
        }
      } catch {
        // Ignore
      }
    });

    next();
  }
}

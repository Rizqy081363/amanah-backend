import type { Request, Response } from 'express';
import type { ClientMetadata } from '../extractors/client-metadata.extractor';
import {
  CORRELATION_ID_HEADER,
  HTTP_EVENT_ERROR,
  HTTP_EVENT_RESPONSE,
} from '../logging.constants';
import {
  sanitizeHeaders,
  sanitizePayload,
} from '../sanitizers/log-redaction.sanitizer';
import {
  type AuthContext,
  extractAuthContext,
} from './http-request.serializer';

export interface SerializedHttpResponse {
  event: typeof HTTP_EVENT_RESPONSE;
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  route?: string;
  statusCode: number;
  durationMs: number;
  headers?: Record<string, any>;
  response?: unknown;
  client: ClientMetadata;
  auth: AuthContext;
}

export interface SerializedHttpError {
  event: typeof HTTP_EVENT_ERROR;
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  route?: string;
  statusCode: number;
  durationMs: number;
  error: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
    response?: unknown;
  };
  client: ClientMetadata;
  auth: AuthContext;
}

export function serializeHttpResponse(params: {
  req: Request & { correlationId?: string; id?: unknown };
  res: Response;
  statusCode: number;
  durationMs: number;
  responseBody?: unknown;
  client: ClientMetadata;
  options?: {
    logBody?: boolean;
    maxBodyLength?: number;
    logHeaders?: boolean;
  };
}): SerializedHttpResponse {
  const { req, res, statusCode, durationMs, responseBody, client, options } =
    params;

  const requestId =
    req.correlationId ||
    (typeof req.headers[CORRELATION_ID_HEADER] === 'string'
      ? (req.headers[CORRELATION_ID_HEADER] as string)
      : req.id
        ? String(req.id)
        : 'unknown');

  const rawUrl = req.originalUrl || req.url || '/';
  const path = req.path || rawUrl.split('?')[0];

  const serialized: SerializedHttpResponse = {
    event: HTTP_EVENT_RESPONSE,
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path,
    route: (req as any).route?.path,
    statusCode,
    durationMs,
    client,
    auth: extractAuthContext(req),
  };

  if (options?.logHeaders && res.getHeaders) {
    serialized.headers = sanitizeHeaders(
      res.getHeaders() as Record<string, any>,
    );
  }

  if (options?.logBody && responseBody !== undefined) {
    serialized.response = sanitizePayload(responseBody, {
      maxLength: options.maxBodyLength,
    });
  }

  return serialized;
}

export function serializeHttpError(params: {
  req: Request & { correlationId?: string; id?: unknown };
  statusCode: number;
  durationMs: number;
  error: unknown;
  client: ClientMetadata;
  options?: {
    includeStack?: boolean;
    maxBodyLength?: number;
  };
}): SerializedHttpError {
  const { req, statusCode, durationMs, error, client, options } = params;

  const requestId =
    req.correlationId ||
    (typeof req.headers[CORRELATION_ID_HEADER] === 'string'
      ? (req.headers[CORRELATION_ID_HEADER] as string)
      : req.id
        ? String(req.id)
        : 'unknown');

  const rawUrl = req.originalUrl || req.url || '/';
  const path = req.path || rawUrl.split('?')[0];

  const errName =
    typeof (error as any)?.name === 'string'
      ? (error as any).name
      : error instanceof Error
        ? error.name
        : 'Error';

  const errMessage =
    typeof (error as any)?.message === 'string'
      ? (error as any).message
      : error instanceof Error
        ? error.message
        : String(error);

  const errStack =
    typeof (error as any)?.stack === 'string'
      ? (error as any).stack
      : error instanceof Error
        ? error.stack
        : undefined;

  const errResponse = (error as any)?.getResponse
    ? (error as any).getResponse()
    : undefined;

  const serialized: SerializedHttpError = {
    event: HTTP_EVENT_ERROR,
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path,
    route: (req as any).route?.path,
    statusCode,
    durationMs,
    error: {
      name: errName,
      message: errMessage,
      code: (error as any)?.code || (errResponse as any)?.code,
      response: errResponse
        ? sanitizePayload(errResponse, { maxLength: options?.maxBodyLength })
        : undefined,
      stack: options?.includeStack ? errStack : undefined,
    },
    client,
    auth: extractAuthContext(req),
  };

  return serialized;
}

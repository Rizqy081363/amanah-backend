import type { Request } from 'express';
import type { ClientMetadata } from '../extractors/client-metadata.extractor';
import {
  CORRELATION_ID_HEADER,
  HTTP_EVENT_REQUEST,
} from '../logging.constants';
import {
  sanitizeHeaders,
  sanitizePayload,
} from '../sanitizers/log-redaction.sanitizer';

export interface AuthContext {
  authenticated: boolean;
  userId?: string;
  role?: string;
  email?: string;
}

export interface SerializedHttpRequest {
  event: typeof HTTP_EVENT_REQUEST;
  requestId: string;
  timestamp: string;
  method: string;
  protocol: string;
  hostname: string;
  url: string;
  path: string;
  route?: string;
  params: Record<string, any>;
  query: Record<string, any>;
  headers: Record<string, any>;
  body?: unknown;
  client: ClientMetadata;
  auth: AuthContext;
}

export function extractAuthContext(req: any): AuthContext {
  const user = req.user;
  if (!user) {
    return { authenticated: false };
  }

  const role =
    typeof user.systemRole === 'string'
      ? user.systemRole
      : typeof user.role?.name === 'string'
        ? user.role.name
        : typeof user.role === 'string'
          ? user.role
          : undefined;

  return {
    authenticated: true,
    userId: user.id || user.userId,
    role,
    email: user.email,
  };
}

export function serializeHttpRequest(
  req: Request & { correlationId?: string; id?: unknown },
  clientMetadata: ClientMetadata,
  options: {
    logBody?: boolean;
    maxBodyLength?: number;
  } = {},
): SerializedHttpRequest {
  const requestId =
    req.correlationId ||
    (typeof req.headers[CORRELATION_ID_HEADER] === 'string'
      ? (req.headers[CORRELATION_ID_HEADER] as string)
      : req.id
        ? String(req.id)
        : 'unknown');

  const rawUrl = req.originalUrl || req.url || '/';
  const path = req.path || rawUrl.split('?')[0];

  const serialized: SerializedHttpRequest = {
    event: HTTP_EVENT_REQUEST,
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    protocol: req.protocol || 'http',
    hostname: req.hostname || 'localhost',
    url: rawUrl,
    path,
    route: (req as any).route?.path,
    params: (req.params as Record<string, any>) || {},
    query: (req.query as Record<string, any>) || {},
    headers: sanitizeHeaders(req.headers),
    client: clientMetadata,
    auth: extractAuthContext(req),
  };

  if (options.logBody && req.body && Object.keys(req.body).length > 0) {
    serialized.body = sanitizePayload(req.body, {
      maxLength: options.maxBodyLength,
    });
  }

  return serialized;
}

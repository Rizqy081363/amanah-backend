import type { Request, Response } from 'express';
import { serializeHttpRequest } from './http-request.serializer';
import {
  serializeHttpError,
  serializeHttpResponse,
} from './http-response.serializer';

describe('HttpSerializers', () => {
  const mockClient = {
    ip: '127.0.0.1',
    ipType: 'direct_socket' as const,
    platform: 'android',
    type: 'mobile',
  };

  describe('serializeHttpRequest', () => {
    it('serializes request with correlationId, sanitized headers, and sanitized body', () => {
      const mockReq = {
        method: 'POST',
        url: '/api/v1/auth/login',
        originalUrl: '/api/v1/auth/login',
        path: '/api/v1/auth/login',
        protocol: 'https',
        hostname: 'api.amanah.local',
        params: { id: 'user-1' },
        query: { ref: 'mobile_app' },
        headers: {
          authorization: 'Bearer secret_token',
          'content-type': 'application/json',
          'x-correlation-id': 'corr-1234',
        },
        body: {
          email: 'doctor@amanah.health',
          password: 'secret_password_123',
        },
        correlationId: 'corr-1234',
      } as unknown as Request & { correlationId?: string };

      const serialized = serializeHttpRequest(mockReq, mockClient, {
        logBody: true,
      });

      expect(serialized.event).toBe('http.request');
      expect(serialized.requestId).toBe('corr-1234');
      expect(serialized.method).toBe('POST');
      expect(serialized.path).toBe('/api/v1/auth/login');
      expect(serialized.headers.authorization).toBe('[REDACTED]');
      expect(serialized.body).toEqual({
        email: 'doctor@amanah.health',
        password: '[REDACTED]',
      });
      expect(serialized.client.platform).toBe('android');
      expect(serialized.auth.authenticated).toBe(false);
    });

    it('extracts safe actor identifier when user is authenticated', () => {
      const mockReq = {
        method: 'GET',
        url: '/api/v1/staffs/me',
        headers: { 'x-correlation-id': 'corr-5678' },
        correlationId: 'corr-5678',
        user: {
          id: 'usr_doc_99',
          email: 'doctor@amanah.health',
          systemRole: 'STAF',
          passwordHash: 'should_not_leak',
        },
      } as unknown as Request & { correlationId?: string; user?: any };

      const serialized = serializeHttpRequest(mockReq, mockClient);

      expect(serialized.auth.authenticated).toBe(true);
      expect(serialized.auth.userId).toBe('usr_doc_99');
      expect(serialized.auth.role).toBe('STAF');
      expect(serialized.auth.email).toBe('doctor@amanah.health');
      expect((serialized.auth as any).passwordHash).toBeUndefined();
    });
  });

  describe('serializeHttpResponse', () => {
    it('serializes successful response with duration and sanitized response body', () => {
      const mockReq = {
        method: 'GET',
        url: '/api/v1/schedules',
        correlationId: 'corr-9999',
        headers: { 'x-correlation-id': 'corr-9999' },
      } as unknown as Request & { correlationId?: string };

      const mockRes = {
        statusCode: 200,
      } as unknown as Response;

      const responseBody = {
        success: true,
        data: [{ id: 'sch-1', slot: '08:00 - 08:30' }],
      };

      const serialized = serializeHttpResponse({
        req: mockReq,
        res: mockRes,
        statusCode: 200,
        durationMs: 45,
        responseBody,
        client: mockClient,
        options: { logBody: true },
      });

      expect(serialized.event).toBe('http.response');
      expect(serialized.requestId).toBe('corr-9999');
      expect(serialized.statusCode).toBe(200);
      expect(serialized.durationMs).toBe(45);
      expect(serialized.response).toEqual(responseBody);
    });
  });

  describe('serializeHttpError', () => {
    it('serializes error with status code, duration, and error response payload', () => {
      const mockReq = {
        method: 'POST',
        url: '/api/v1/appointments',
        correlationId: 'corr-error-1',
        headers: { 'x-correlation-id': 'corr-error-1' },
      } as unknown as Request & { correlationId?: string };

      const errorPayload = {
        title: 'Conflict',
        status: 409,
        detail: 'Schedule is already occupied',
        code: 'SCHEDULE_OCCUPIED',
      };

      const serialized = serializeHttpError({
        req: mockReq,
        statusCode: 409,
        durationMs: 38,
        error: {
          name: 'ConflictException',
          message: 'Schedule is already occupied',
          code: 'SCHEDULE_OCCUPIED',
          getResponse: () => errorPayload,
        },
        client: mockClient,
      });

      expect(serialized.event).toBe('http.error');
      expect(serialized.requestId).toBe('corr-error-1');
      expect(serialized.statusCode).toBe(409);
      expect(serialized.durationMs).toBe(38);
      expect(serialized.error.name).toBe('ConflictException');
      expect(serialized.error.code).toBe('SCHEDULE_OCCUPIED');
      expect(serialized.error.response).toEqual(errorPayload);
    });
  });
});

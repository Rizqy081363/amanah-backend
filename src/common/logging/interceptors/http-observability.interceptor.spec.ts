import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { HttpObservabilityInterceptor } from './http-observability.interceptor';

describe('HttpObservabilityInterceptor', () => {
  let interceptor: HttpObservabilityInterceptor;

  beforeEach(() => {
    interceptor = new HttpObservabilityInterceptor();
  });

  it('captures response data into res.locals without mutating the return payload', (done) => {
    const mockRes = {
      locals: {} as Record<string, any>,
    };

    const mockContext = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => mockRes,
        getRequest: () => ({}),
      }),
    } as unknown as ExecutionContext;

    const responsePayload = { success: true, data: { id: 123 } };
    const mockHandler: CallHandler = {
      handle: () => of(responsePayload),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: (val) => {
        expect(val).toEqual(responsePayload);
        expect(mockRes.locals.__observedResponseBody).toEqual(responsePayload);
        done();
      },
      error: done,
    });
  });

  it('safely handles non-http contexts', (done) => {
    const mockContext = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;

    const mockHandler: CallHandler = {
      handle: () => of('rpc-result'),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: (val) => {
        expect(val).toBe('rpc-result');
        done();
      },
      error: done,
    });
  });
});

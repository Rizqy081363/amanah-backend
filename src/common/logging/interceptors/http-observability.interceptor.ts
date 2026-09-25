import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class HttpObservabilityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: (data) => {
          try {
            if (res?.locals) {
              res.locals.__observedResponseBody = data;
            }
          } catch {
            // Passive observability must never throw or disrupt response flow
          }
        },
      }),
    );
  }
}

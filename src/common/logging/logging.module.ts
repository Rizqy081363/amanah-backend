import { randomUUID } from 'node:crypto';
import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { AllConfigType } from '../../config/config.type';
import { HttpObservabilityInterceptor } from './interceptors/http-observability.interceptor';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from './logging.constants';
import { HttpObservabilityMiddleware } from './middleware/http-observability.middleware';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => {
        const appConfig = configService.get('app', { infer: true });
        const isPretty = appConfig?.logPretty ?? false;
        const logLevel =
          appConfig?.logLevel ??
          (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

        return {
          pinoHttp: {
            level: logLevel,
            autoLogging: false,
            genReqId: (req, res) => {
              const raw =
                req.headers[CORRELATION_ID_HEADER] ||
                req.headers[REQUEST_ID_HEADER];
              const id =
                typeof raw === 'string' && raw.trim().length > 0
                  ? raw.trim()
                  : randomUUID();

              (req as any).correlationId = id;
              req.headers[CORRELATION_ID_HEADER] = id;
              res.setHeader(CORRELATION_ID_HEADER, id);
              return id;
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["set-cookie"]',
                'req.headers["proxy-authorization"]',
                '*.password',
                '*.passwordHash',
                '*.token',
                '*.refreshToken',
                '*.accessToken',
                '*.secret',
              ],
              censor: '[REDACTED]',
            },
            transport: isPretty
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:HH:MM:ss',
                    ignore: 'pid,hostname',
                    singleLine: false,
                  },
                }
              : undefined,
          },
        };
      },
    }),
  ],
  providers: [HttpObservabilityMiddleware, HttpObservabilityInterceptor],
  exports: [
    LoggerModule,
    HttpObservabilityMiddleware,
    HttpObservabilityInterceptor,
  ],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpObservabilityMiddleware).forRoutes('*');
  }
}

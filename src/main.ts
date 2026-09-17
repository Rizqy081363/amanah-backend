import 'dotenv/config';
import {
  ClassSerializerInterceptor,
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllConfigType } from './config/config.type';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { RedisService } from './common/redis/redis.service';
import { ResolvePromisesInterceptor } from './utils/serializer.interceptor';
import validationOptions from './utils/validation-options';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logger.log('Starting Amanah Healthcare NestJS Backend...');
  const app = await NestFactory.create(AppModule);
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  const configService = app.get(ConfigService<AllConfigType>);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const corsOrigins = configService.getOrThrow('app.corsOrigins', {
    infer: true,
  });
  app.enableCors({
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  });

  app.enableShutdownHooks();
  app.setGlobalPrefix(
    configService.getOrThrow('app.apiPrefix', { infer: true }),
    {
      exclude: [
        { path: '/', method: RequestMethod.GET },
        { path: 'health/live', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
      ],
    },
  );
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
  app.useGlobalFilters(new ProblemDetailsFilter());
  const reflector = app.get(Reflector);
  const redisService = app.get(RedisService);
  app.useGlobalInterceptors(
    // ResolvePromisesInterceptor is used to resolve promises in responses because class-transformer can't do it
    // https://github.com/typestack/class-transformer/issues/549
    new ResolvePromisesInterceptor(),
    new ClassSerializerInterceptor(reflector),
    new IdempotencyInterceptor(redisService, reflector),
  );

  const port = configService.getOrThrow('app.port', { infer: true });
  const backendDomain =
    configService.get('app.backendDomain', { infer: true }) ||
    `http://localhost:${port}`;

  const options = new DocumentBuilder()
    .setTitle('Amanah Healthcare API')
    .setDescription(
      'Enterprise Backend API for Amanah Clinic (Poli Umum, Poli KIA, Staff Mobile App, Admin Dashboard)',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Masukkan JWT Bearer token untuk autentikasi API',
        in: 'header',
      },
      'access-token',
    )
    .addServer(`http://localhost:${port}`, 'Local Development Server')
    .addServer(backendDomain, 'Application Gateway')
    .addGlobalParameters(
      {
        in: 'header',
        required: false,
        name: process.env.APP_HEADER_LANGUAGE || 'x-custom-lang',
        schema: {
          example: 'en',
        },
      },
      {
        in: 'header',
        required: false,
        name: 'Idempotency-Key',
        description:
          'Kunci idempotensi unik dari client untuk keamanan retry pada request mutasi (API-139..API-145). Retensi: 24 jam.',
        schema: {
          type: 'string',
          maxLength: 128,
          example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        },
      },
    )
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
  });
  await app.listen(port);
  logger.log(`Amanah Healthcare Backend is running on port ${port}.`);
  logger.log(`Swagger documentation available at /docs.`);
}
bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    'Bootstrap failed.',
    err instanceof Error ? err.stack : String(err),
  );
  process.exit(1);
});

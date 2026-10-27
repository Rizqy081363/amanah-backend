import 'reflect-metadata';
import { plainToClass } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Production = 'production',
  }

export enum AppRuntime {
  Container = 'container',
  }

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  @IsOptional()
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsEnum(AppRuntime)
  @IsOptional()
  APP_RUNTIME?: AppRuntime;

  @IsString()
  @IsNotEmpty()
  APP_NAME: string = 'Amanah Healthcare Backend';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  APP_PORT: number = 3001;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api';

  @IsString()
  @IsOptional()
  APP_FALLBACK_LANGUAGE: string = 'en';

  @IsString()
  @IsOptional()
  APP_HEADER_LANGUAGE: string = 'x-custom-lang';

  @IsString()
  @IsNotEmpty()
  FRONTEND_DOMAIN: string;

  @IsString()
  @IsNotEmpty()
  BACKEND_DOMAIN: string;

  @IsString()
  @IsNotEmpty()
  BETTER_AUTH_URL: string;

  @IsString()
  @MinLength(32, { message: 'BETTER_AUTH_SECRET must be at least 32 characters long' })
  BETTER_AUTH_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'AUTH_JWT_SECRET must be at least 32 characters long' })
  AUTH_JWT_SECRET: string;

  @IsString()
  @IsOptional()
  AUTH_JWT_TOKEN_EXPIRES_IN: string = '8h';

  @IsString()
  @MinLength(32, { message: 'AUTH_REFRESH_SECRET must be at least 32 characters long' })
  AUTH_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  AUTH_REFRESH_TOKEN_EXPIRES_IN: string = '30d';

  @IsString()
  @MinLength(32, { message: 'AUTH_FORGOT_SECRET must be at least 32 characters long' })
  AUTH_FORGOT_SECRET: string;

  @IsString()
  @IsOptional()
  AUTH_FORGOT_TOKEN_EXPIRES_IN: string = '30m';

  @IsString()
  @MinLength(32, { message: 'AUTH_CONFIRM_EMAIL_SECRET must be at least 32 characters long' })
  AUTH_CONFIRM_EMAIL_SECRET: string;

  @IsString()
  @IsOptional()
  AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN: string = '1d';

  @IsString()
  @IsOptional()
  AUTH_RESET_PASSWORD_PATH: string = '/auth/sign-in/reset-password';

  @IsBoolean()
  @IsOptional()
  AUTH_UNIFORM_ERRORS: boolean = false;

  @IsString()
  @IsOptional()
  DATABASE_TYPE: string = 'postgres';

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_HOST is required' })
  DATABASE_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  DATABASE_PORT: number = 5432;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_USERNAME is required' })
  DATABASE_USERNAME: string;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_PASSWORD is required' })
  DATABASE_PASSWORD: string;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_NAME is required' })
  DATABASE_NAME: string;

  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  DATABASE_MAX_CONNECTIONS: number = 20;

  @IsString()
  @Matches(/^rediss?:\/\/.+/, {
    message: 'REDIS_URL must be a valid redis:// or rediss:// connection string with database index',
  })
  REDIS_URL: string;

  @IsString()
  @Matches(/^amqps?:\/\/.+/, {
    message: 'RABBITMQ_URL must be a valid amqp:// or amqps:// connection string',
  })
  RABBITMQ_URL: string;

  @IsString()
  @IsOptional()
  RABBITMQ_USER?: string;

  @IsString()
  @IsOptional()
  RABBITMQ_PASSWORD?: string;

  @IsString()
  @IsNotEmpty({ message: 'SMTP_HOST is required' })
  SMTP_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  SMTP_PORT: number = 1025;

  @IsString()
  @IsOptional()
  CLINIC_TIMEZONE: string = 'Asia/Jakarta';

  @IsString()
  @IsOptional()
  PROCESS_TZ: string = 'Asia/Jakarta';

  @IsString()
  @IsOptional()
  DB_TIMEZONE: string = 'Asia/Jakarta';

  @IsString()
  @IsOptional()
  APP_CORS_ORIGINS?: string;

  @IsString()
  @IsOptional()
  APP_DEV_ORIGIN_PATTERNS?: string;

  @IsString()
  @IsOptional()
  LOG_LEVEL?: string;

  @IsBoolean()
  @IsOptional()
  LOG_PRETTY?: boolean;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  GOOGLE_APPLICATION_CREDENTIALS?: string;

  @IsString()
  @IsOptional()
  VAPID_PUBLIC_KEY?: string;

  @IsBoolean()
  @IsOptional()
  HTTP_LOG_REQUEST_BODY?: boolean;

  @IsBoolean()
  @IsOptional()
  HTTP_LOG_RESPONSE_BODY?: boolean;

  @IsInt()
  @IsOptional()
  HTTP_LOG_MAX_BODY_LENGTH?: number;

  @IsString()
  @IsOptional()
  TRUST_PROXY?: string;

  @IsBoolean()
  @IsOptional()
  DATABASE_SYNCHRONIZE?: boolean;

  @IsBoolean()
  @IsOptional()
  DATABASE_SSL_ENABLED?: boolean;

  @IsBoolean()
  @IsOptional()
  DATABASE_REJECT_UNAUTHORIZED?: boolean;

  @IsString()
  @IsOptional()
  DATABASE_CA?: string;

  @IsString()
  @IsOptional()
  DATABASE_KEY?: string;

  @IsString()
  @IsOptional()
  DATABASE_CERT?: string;

  @IsString()
  @IsOptional()
  CACHE_KEY_PREFIX?: string;

  @IsInt()
  @IsOptional()
  CACHE_DEFAULT_TTL_SECONDS?: number;

  @IsInt()
  @IsOptional()
  CACHE_READINESS_TIMEOUT_MS?: number;

  @IsInt()
  @IsOptional()
  CACHE_MAX_RECONNECT_ATTEMPTS?: number;

  @IsString()
  @IsOptional()
  MAIL_HOST?: string;

  @IsInt()
  @IsOptional()
  MAIL_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string;

  @IsBoolean()
  @IsOptional()
  SMTP_SECURE?: boolean;

  @IsString()
  @IsOptional()
  FACEBOOK_APP_ID?: string;

  @IsString()
  @IsOptional()
  FACEBOOK_APP_SECRET?: string;

  @IsString()
  @IsOptional()
  APPLE_APP_AUDIENCE?: string;

  @IsBoolean()
  @IsOptional()
  RUN_DB_MIGRATIONS?: boolean;

  @IsBoolean()
  @IsOptional()
  RUN_DB_SEED?: boolean;

  @IsString()
  @IsOptional()
  VAPID_PRIVATE_KEY?: string;

  @IsString()
  @IsOptional()
  VAPID_SUBJECT?: string;

  @IsString()
  @IsOptional()
  FILE_DRIVER?: string = 'local';

  @IsString()
  @IsOptional()
  MAIL_DEFAULT_NAME?: string = 'Amanah Healthcare';

  @IsString()
  @IsOptional()
  MAIL_DEFAULT_EMAIL?: string = 'noreply@amanah-healthcare.local';
}

const FORBIDDEN_PROD_SECRET_PATTERNS = [
  'dev_secret',
  'changeme',
  'example',
  'dummy',
  'placeholder',
];

const SECRET_KEYS: (keyof EnvironmentVariables)[] = [
  'BETTER_AUTH_SECRET',
  'AUTH_JWT_SECRET',
  'AUTH_REFRESH_SECRET',
  'AUTH_FORGOT_SECRET',
  'AUTH_CONFIRM_EMAIL_SECRET',
];

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];

function containsLoopback(hostOrUrl: string): boolean {
  try {
    if (hostOrUrl.includes('://')) {
      const parsed = new URL(hostOrUrl);
      return LOOPBACK_HOSTS.includes(parsed.hostname);
    }
  } catch {
    // If not a standard URL, treat as hostname
  }
  return LOOPBACK_HOSTS.includes(hostOrUrl.trim().toLowerCase());
}

export function validateEnvironment(
  rawConfig: Record<string, unknown>,
): EnvironmentVariables {
  // Support boolean string coercion
  const normalized: Record<string, unknown> = { ...rawConfig };
  for (const [key, value] of Object.entries(normalized)) {
    if (value === 'true') normalized[key] = true;
    if (value === 'false') normalized[key] = false;
  }

  const validated = plainToClass(EnvironmentVariables, normalized, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    stopAtFirstError: false,
  });

  if (errors.length > 0) {
    const errorDetails = errors
      .map((e) => {
        const constraints = e.constraints ? Object.values(e.constraints).join(', ') : 'Invalid property';
        return `[${e.property}]: ${constraints}`;
      })
      .join('; ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }

  // Enterprise Rule 1: Reject weak/dummy secrets in production mode
  if (validated.NODE_ENV === NodeEnvironment.Production) {
    for (const key of SECRET_KEYS) {
      const secretVal = (validated[key] as string) || '';
      const lower = secretVal.toLowerCase();
      for (const pattern of FORBIDDEN_PROD_SECRET_PATTERNS) {
        if (lower.includes(pattern)) {
          throw new Error(
            `Environment validation failed: [${key}] contains forbidden dummy/placeholder pattern in production mode`,
          );
        }
      }
    }
  }

  // Enterprise Rule 2: In container mode, reject loopback host references
  if (validated.APP_RUNTIME === AppRuntime.Container) {
    if (containsLoopback(validated.DATABASE_HOST)) {
      throw new Error(
        'Environment validation failed: [DATABASE_HOST] must not use loopback host (localhost/127.0.0.1) in container runtime mode',
      );
    }
    if (containsLoopback(validated.REDIS_URL)) {
      throw new Error(
        'Environment validation failed: [REDIS_URL] must not use loopback host (localhost/127.0.0.1) in container runtime mode',
      );
    }
    if (containsLoopback(validated.RABBITMQ_URL)) {
      throw new Error(
        'Environment validation failed: [RABBITMQ_URL] must not use loopback host (localhost/127.0.0.1) in container runtime mode',
      );
    }
    if (containsLoopback(validated.SMTP_HOST)) {
      throw new Error(
        'Environment validation failed: [SMTP_HOST] must not use loopback host (localhost/127.0.0.1) in container runtime mode',
      );
    }
  }

  return validated;
}

// Single door export: validated environment instance
let cachedEnv: EnvironmentVariables | null = null;

function getEnv(): EnvironmentVariables {
  if (!cachedEnv) {
    cachedEnv = validateEnvironment(process.env);
  }
  return cachedEnv;
}

export const env = new Proxy({} as EnvironmentVariables, {
  get(_target, prop: string | symbol) {
    return (getEnv() as any)[prop];
  },
});

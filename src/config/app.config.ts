import { registerAs } from '@nestjs/config';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import validateConfig from '.././utils/validate-config';
import { AppConfig } from './app-config.type';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariablesValidator {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  APP_PORT: number;

  @IsUrl({ require_tld: false })
  @IsOptional()
  FRONTEND_DOMAIN: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  BACKEND_DOMAIN: string;

  @IsString()
  @IsOptional()
  APP_CORS_ORIGINS: string;

  @IsString()
  @IsOptional()
  API_PREFIX: string;

  @IsString()
  @IsOptional()
  APP_HEADER_LANGUAGE: string;

  @IsString()
  @IsOptional()
  LOG_LEVEL: string;

  @IsOptional()
  LOG_PRETTY: boolean;

  @IsOptional()
  HTTP_LOG_REQUEST_BODY: boolean;

  @IsOptional()
  HTTP_LOG_RESPONSE_BODY: boolean;

  @IsInt()
  @IsOptional()
  HTTP_LOG_MAX_BODY_LENGTH: number;

  @IsString()
  @IsOptional()
  TRUST_PROXY: string;

  @IsString()
  @IsOptional()
  APP_TIMEZONE: string;

  @IsString()
  @IsOptional()
  CLINIC_TIMEZONE: string;
}

export default registerAs<AppConfig>('app', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  const isProduction = process.env.NODE_ENV === 'production';

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    name: process.env.APP_NAME || 'app',
    workingDirectory: process.env.PWD || process.cwd(),
    frontendDomain: process.env.FRONTEND_DOMAIN,
    backendDomain: process.env.BACKEND_DOMAIN ?? 'http://localhost',
    corsOrigins: (
      process.env.APP_CORS_ORIGINS ||
      process.env.FRONTEND_DOMAIN ||
      '*'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    port: process.env.APP_PORT
      ? parseInt(process.env.APP_PORT, 10)
      : process.env.PORT
        ? parseInt(process.env.PORT, 10)
        : 3000,
    apiPrefix: process.env.API_PREFIX || 'api',
    headerLanguage: process.env.APP_HEADER_LANGUAGE || 'x-custom-lang',
    logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    logPretty:
      process.env.LOG_PRETTY !== undefined
        ? process.env.LOG_PRETTY === 'true'
        : !isProduction,
    httpLogRequestBody:
      process.env.HTTP_LOG_REQUEST_BODY !== undefined
        ? process.env.HTTP_LOG_REQUEST_BODY === 'true'
        : !isProduction,
    httpLogResponseBody:
      process.env.HTTP_LOG_RESPONSE_BODY !== undefined
        ? process.env.HTTP_LOG_RESPONSE_BODY === 'true'
        : !isProduction,
    httpLogMaxBodyLength: process.env.HTTP_LOG_MAX_BODY_LENGTH
      ? parseInt(process.env.HTTP_LOG_MAX_BODY_LENGTH, 10)
      : 10000,
    trustProxy:
      process.env.TRUST_PROXY === 'true'
        ? true
        : process.env.TRUST_PROXY === 'false'
          ? false
          : process.env.TRUST_PROXY || (isProduction ? 'loopback' : false),
    timezone:
      process.env.APP_TIMEZONE ||
      process.env.CLINIC_TIMEZONE ||
      'Asia/Jakarta',
  };
});

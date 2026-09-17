import { registerAs } from '@nestjs/config';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { MailConfig } from './mail-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  SMTP_PORT?: number;

  @IsBoolean()
  @IsOptional()
  SMTP_SECURE?: boolean;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string;

  @IsEmail()
  @IsOptional()
  MAIL_FROM?: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  MAIL_PORT?: number;

  @IsString()
  @IsOptional()
  MAIL_HOST?: string;

  @IsString()
  @IsOptional()
  MAIL_USER?: string;

  @IsString()
  @IsOptional()
  MAIL_PASSWORD?: string;

  @IsEmail()
  @IsOptional()
  MAIL_DEFAULT_EMAIL?: string;

  @IsString()
  @IsOptional()
  MAIL_DEFAULT_NAME?: string;

  @IsBoolean()
  @IsOptional()
  MAIL_IGNORE_TLS?: boolean;

  @IsBoolean()
  @IsOptional()
  MAIL_SECURE?: boolean;

  @IsBoolean()
  @IsOptional()
  MAIL_REQUIRE_TLS?: boolean;
}

export default registerAs<MailConfig>('mail', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || 'localhost';
  const port = process.env.SMTP_PORT
    ? parseInt(process.env.SMTP_PORT, 10)
    : process.env.MAIL_PORT
      ? parseInt(process.env.MAIL_PORT, 10)
      : 1025;
  const secure =
    (process.env.SMTP_SECURE ?? process.env.MAIL_SECURE) === 'true';
  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  const password = process.env.SMTP_PASSWORD || process.env.MAIL_PASSWORD;
  const defaultEmail =
    process.env.MAIL_FROM ||
    process.env.MAIL_DEFAULT_EMAIL ||
    'noreply@amanah-healthcare.local';
  const defaultName = process.env.MAIL_DEFAULT_NAME || 'Amanah Healthcare';
  const ignoreTLS =
    process.env.MAIL_IGNORE_TLS === 'true' ||
    process.env.NODE_ENV === 'development';
  const requireTLS = process.env.MAIL_REQUIRE_TLS === 'true';

  return {
    port,
    host,
    user,
    password,
    defaultEmail,
    defaultName,
    ignoreTLS,
    secure,
    requireTLS,
  };
});

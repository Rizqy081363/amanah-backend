import { describe, expect, it } from 'bun:test';
import {
  AppRuntime,
  MailDriver,
  NodeEnvironment,
  validateEnvironment,
} from './env';

const VALID_BASE_CONFIG = {
  NODE_ENV: NodeEnvironment.Development,
  APP_NAME: 'Amanah Healthcare Backend',
  APP_PORT: '3001',
  API_PREFIX: 'api',
  FRONTEND_DOMAIN: 'http://localhost:3000',
  BACKEND_DOMAIN: 'http://localhost:3001',
  BETTER_AUTH_URL: 'http://localhost:3001',
  BETTER_AUTH_SECRET: 'a_very_long_valid_secret_with_more_than_32_characters_123',
  AUTH_JWT_SECRET: 'another_super_secure_jwt_secret_32_characters_long_min',
  AUTH_REFRESH_SECRET: 'refresh_secret_must_also_be_at_least_32_characters_long',
  AUTH_FORGOT_SECRET: 'forgot_password_secret_is_also_32_characters_or_more_long',
  AUTH_CONFIRM_EMAIL_SECRET: 'confirm_email_secret_is_very_long_and_at_least_32_chars',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_USERNAME: 'amanah',
  DATABASE_PASSWORD: 'amanah_secret',
  DATABASE_NAME: 'amanah_healthcare',
  REDIS_URL: 'redis://localhost:6379/1',
  RABBITMQ_URL: 'amqp://amanah:amanah_secret@localhost:5672',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
};

describe('Enterprise Environment Validation (env.ts)', () => {
  it('should successfully validate a complete and valid environment', () => {
    const validated = validateEnvironment(VALID_BASE_CONFIG);
    expect(validated.APP_PORT).toBe(3001);
    expect(validated.DATABASE_NAME).toBe('amanah_healthcare');
    expect(validated.REDIS_URL).toBe('redis://localhost:6379/1');
  });

  it('should fail when a required variable is missing and mention the variable name', () => {
    const invalidConfig = { ...VALID_BASE_CONFIG };
    delete (invalidConfig as any).DATABASE_NAME;

    expect(() => validateEnvironment(invalidConfig)).toThrow(
      /DATABASE_NAME is required/,
    );
  });

  it('should fail when secret length is less than 32 characters', () => {
    const invalidConfig = {
      ...VALID_BASE_CONFIG,
      AUTH_JWT_SECRET: 'short_secret_only_19_c',
    };

    expect(() => validateEnvironment(invalidConfig)).toThrow(
      /AUTH_JWT_SECRET must be at least 32 characters long/,
    );
  });

  it('should fail in production mode if secret contains dummy or placeholder keywords', () => {
    const prodConfig = {
      ...VALID_BASE_CONFIG,
      NODE_ENV: NodeEnvironment.Production,
      BETTER_AUTH_SECRET: 'amanah_better_auth_dev_secret_32_characters_minimum_len',
    };

    expect(() => validateEnvironment(prodConfig)).toThrow(
      /\[BETTER_AUTH_SECRET\] contains forbidden dummy\/placeholder pattern in production mode/,
    );
  });

  it('should fail in container mode if loopback host is used for infrastructure', () => {
    const containerConfigWithLocalRedis = {
      ...VALID_BASE_CONFIG,
      APP_RUNTIME: AppRuntime.Container,
      REDIS_URL: 'redis://localhost:6379/1',
      DATABASE_HOST: 'postgres',
      SMTP_HOST: 'mailpit',
      RABBITMQ_URL: 'amqp://rabbitmq:5672',
    };

    expect(() => validateEnvironment(containerConfigWithLocalRedis)).toThrow(
      /\[REDIS_URL\] must not use loopback host/,
    );

    const containerConfigWithLocalDb = {
      ...VALID_BASE_CONFIG,
      APP_RUNTIME: AppRuntime.Container,
      REDIS_URL: 'redis://redis:6379/1',
      DATABASE_HOST: '127.0.0.1',
      SMTP_HOST: 'mailpit',
      RABBITMQ_URL: 'amqp://rabbitmq:5672',
    };

    expect(() => validateEnvironment(containerConfigWithLocalDb)).toThrow(
      /\[DATABASE_HOST\] must not use loopback host/,
    );
  });

  it('should pass in container mode when using internal service names', () => {
    const validContainerConfig = {
      ...VALID_BASE_CONFIG,
      APP_RUNTIME: AppRuntime.Container,
      DATABASE_HOST: 'postgres',
      REDIS_URL: 'redis://redis:6379/1',
      SMTP_HOST: 'mailpit',
      RABBITMQ_URL: 'amqp://rabbitmq:5672',
    };

    const validated = validateEnvironment(validContainerConfig);
    expect(validated.DATABASE_HOST).toBe('postgres');
    expect(validated.REDIS_URL).toBe('redis://redis:6379/1');
  });

  it('should never expose the secret value in the error message', () => {
    const secretValue = 'this_exact_secret_value_should_never_leak_in_error_message';
    const invalidConfig = {
      ...VALID_BASE_CONFIG,
      NODE_ENV: NodeEnvironment.Production,
      AUTH_JWT_SECRET: secretValue + '_dev_secret',
    };

    try {
      validateEnvironment(invalidConfig);
      expect(true).toBe(false); // Should not reach here
    } catch (error: any) {
      expect(error.message).not.toContain(secretValue);
      expect(error.message).toContain('AUTH_JWT_SECRET');
    }
  });

  describe('Mail Transporter & Resend Configuration Matrix', () => {
    it('should successfully validate MAIL_DRIVER=smtp in development without RESEND_API_KEY', () => {
      const config = {
        ...VALID_BASE_CONFIG,
        MAIL_DRIVER: MailDriver.Smtp,
      };
      const validated = validateEnvironment(config);
      expect(validated.MAIL_DRIVER).toBe(MailDriver.Smtp);
      expect(validated.RESEND_API_KEY).toBeUndefined();
    });

    it('should successfully validate MAIL_DRIVER=resend when valid RESEND_API_KEY is provided', () => {
      const config = {
        ...VALID_BASE_CONFIG,
        MAIL_DRIVER: MailDriver.Resend,
        RESEND_API_KEY: 're_valid_prod_key_1234567890',
      };
      const validated = validateEnvironment(config);
      expect(validated.MAIL_DRIVER).toBe(MailDriver.Resend);
      expect(validated.RESEND_API_KEY).toBe('re_valid_prod_key_1234567890');
    });

    it('should fail when MAIL_DRIVER=resend and RESEND_API_KEY is missing', () => {
      const config = {
        ...VALID_BASE_CONFIG,
        MAIL_DRIVER: MailDriver.Resend,
      };
      expect(() => validateEnvironment(config)).toThrow(
        /\[RESEND_API_KEY\] is required when MAIL_DRIVER=resend/,
      );
    });

    it('should fail in production mode when MAIL_DRIVER=smtp points to loopback or mailpit', () => {
      const config = {
        ...VALID_BASE_CONFIG,
        NODE_ENV: NodeEnvironment.Production,
        MAIL_DRIVER: MailDriver.Smtp,
        SMTP_HOST: 'mailpit',
      };
      expect(() => validateEnvironment(config)).toThrow(
        /\[MAIL_DRIVER\] Local mailer .* is not allowed in production mode/,
      );
    });

    it('should fail when MAIL_DRIVER is an invalid enum value', () => {
      const config = {
        ...VALID_BASE_CONFIG,
        MAIL_DRIVER: 'unsupported_driver',
      };
      expect(() => validateEnvironment(config)).toThrow(
        /MAIL_DRIVER must be one of the following values/,
      );
    });
  });
});

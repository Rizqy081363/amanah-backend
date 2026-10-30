import { describe, expect, it } from 'bun:test';
import type { ConfigService } from '@nestjs/config';
import type { AllConfigType } from '../../config/config.type';
import { MailDeliveryError } from '../errors/mail-delivery.error';
import { ResendMailAdapter } from './resend-mail.adapter';

function createMockConfigService(apiKey?: string): ConfigService<AllConfigType> {
  return {
    get: (key: string) => {
      if (key === 'mail.resendApiKey') return apiKey;
      if (key === 'mail.defaultName') return 'Amanah Healthcare';
      if (key === 'mail.defaultEmail') return 'noreply@amanah.health';
      return undefined;
    },
  } as unknown as ConfigService<AllConfigType>;
}

describe('ResendMailAdapter Contract & Verification', () => {
  it('should throw an error during instantiation if RESEND_API_KEY is missing', () => {
    const configService = createMockConfigService(undefined);
    expect(() => new ResendMailAdapter(configService)).toThrow(
      /RESEND_API_KEY is not defined in environment/,
    );
  });

  it('should successfully instantiate when RESEND_API_KEY is present', () => {
    const configService = createMockConfigService('re_test_key_123');
    const adapter = new ResendMailAdapter(configService);
    expect(adapter).toBeDefined();
  });

  it('should throw MailDeliveryError when Resend SDK returns an error object without throwing', async () => {
    const configService = createMockConfigService('re_test_key_123');
    const adapter = new ResendMailAdapter(configService);

    // Mock client.emails.send to simulate Resend API returning { data: null, error: { message, name } }
    (adapter as any).client = {
      emails: {
        send: async () => ({
          data: null,
          error: {
            name: 'validation_error',
            message: 'The domain is not verified',
          },
        }),
      },
    };

    try {
      await adapter.send({
        to: 'user@example.com',
        subject: 'Test Subject',
        text: 'Hello world',
      });
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(MailDeliveryError);
      expect((err as MailDeliveryError).message).toContain('The domain is not verified');
      expect((err as MailDeliveryError).provider).toBe('Resend');
      // Ensure the API key is not present in the error
      expect((err as MailDeliveryError).message).not.toContain('re_test_key_123');
    }
  });

  it('should return messageId on successful dispatch', async () => {
    const configService = createMockConfigService('re_test_key_123');
    const adapter = new ResendMailAdapter(configService);

    (adapter as any).client = {
      emails: {
        send: async (options: any) => {
          expect(options.to).toEqual(['user@example.com']);
          expect(options.subject).toBe('Welcome to Amanah');
          expect(options.text).toBe('Welcome text');
          return {
            data: { id: 're_message_998877' },
            error: null,
          };
        },
      },
    };

    const result = await adapter.send({
      to: 'user@example.com',
      subject: 'Welcome to Amanah',
      text: 'Welcome text',
    });

    expect(result.messageId).toBe('re_message_998877');
  });
});

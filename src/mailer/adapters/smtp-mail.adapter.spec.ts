import { describe, expect, it } from 'bun:test';
import type { ConfigService } from '@nestjs/config';
import type { AllConfigType } from '../../config/config.type';
import { MailDeliveryError } from '../errors/mail-delivery.error';
import { SmtpMailAdapter } from './smtp-mail.adapter';

function createMockConfigService(): ConfigService<AllConfigType> {
  return {
    get: (key: string) => {
      if (key === 'mail.host') return 'localhost';
      if (key === 'mail.port') return 1025;
      if (key === 'mail.defaultName') return 'Amanah Healthcare';
      if (key === 'mail.defaultEmail') return 'noreply@amanah.health';
      return undefined;
    },
  } as unknown as ConfigService<AllConfigType>;
}

describe('SmtpMailAdapter Contract & Verification', () => {
  it('should successfully instantiate with default host and port', () => {
    const configService = createMockConfigService();
    const adapter = new SmtpMailAdapter(configService);
    expect(adapter).toBeDefined();
  });

  it('should return messageId on successful SMTP dispatch', async () => {
    const configService = createMockConfigService();
    const adapter = new SmtpMailAdapter(configService);

    (adapter as any).transporter = {
      sendMail: async (options: any) => {
        expect(options.to).toBe('doctor@example.com');
        expect(options.subject).toBe('Staff Invitation');
        return {
          messageId: '<test-smtp-message-id-123@localhost>',
        };
      },
    };

    const result = await adapter.send({
      to: 'doctor@example.com',
      subject: 'Staff Invitation',
      text: 'You have been invited.',
    });

    expect(result.messageId).toBe('<test-smtp-message-id-123@localhost>');
  });

  it('should throw MailDeliveryError when transporter.sendMail fails', async () => {
    const configService = createMockConfigService();
    const adapter = new SmtpMailAdapter(configService);

    (adapter as any).transporter = {
      sendMail: async () => {
        throw new Error('Connection refused to SMTP 1025');
      },
    };

    try {
      await adapter.send({
        to: 'doctor@example.com',
        subject: 'Staff Invitation',
        text: 'You have been invited.',
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(MailDeliveryError);
      expect((err as MailDeliveryError).message).toContain('Connection refused to SMTP 1025');
      expect((err as MailDeliveryError).provider).toBe('SMTP/Mailpit');
    }
  });
});

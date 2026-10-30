import { describe, expect, it } from 'bun:test';
import { MailerService } from './mailer.service';
import type { MailTransporterPort } from './ports/mail-transporter.port';
import type { SendMailPayload } from './types/send-mail-payload.type';

describe('MailerService Delegation & Templating', () => {
  it('should compile context and forward payload to MailTransporterPort', async () => {
    let capturedPayload: SendMailPayload | null = null;

    const mockTransporter: MailTransporterPort = {
      send: async (payload: SendMailPayload) => {
        capturedPayload = payload;
        return { messageId: 'msg-abc-123' };
      },
    };

    const service = new MailerService(mockTransporter);

    const result = await service.sendMail({
      to: 'recipient@amanah.health',
      from: 'custom-sender@amanah.health',
      subject: 'Security Alert',
      text: 'Your password was changed.',
    });

    expect(result.messageId).toBe('msg-abc-123');
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload?.to).toBe('recipient@amanah.health');
    expect(capturedPayload?.from).toBe('custom-sender@amanah.health');
    expect(capturedPayload?.subject).toBe('Security Alert');
    expect(capturedPayload?.text).toBe('Your password was changed.');
  });
});

import { ConfigService } from '@nestjs/config';
import { MailerService } from '../mailer/mailer.service';
import { MailService } from './mail.service';

describe('MailService (Password Reset URL Contract & SSOT Tests)', () => {
  let mailService: MailService;
  let configService: jest.Mocked<ConfigService>;
  let mailerService: jest.Mocked<MailerService>;

  const defaultFrontendDomain = 'http://localhost:3000';
  const defaultResetPath = '/auth/sign-in/reset-password';

  beforeEach(() => {
    configService = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mailerService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MailerService>;

    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'app.frontendDomain') {
        return defaultFrontendDomain;
      }
      throw new Error(`Unexpected config key: ${key}`);
    });

    configService.get.mockImplementation((key: string) => {
      if (key === 'auth.resetPasswordPath') {
        return defaultResetPath;
      }
      if (key === 'app.name') {
        return 'Amanah Healthcare';
      }
      return undefined;
    });

    mailService = new MailService(mailerService, configService);
  });

  describe('buildResetPasswordUrl (SSOT Contract)', () => {
    it('should generate canonical URL pointing to /auth/sign-in/reset-password by default', () => {
      const url = mailService.buildResetPasswordUrl({
        hash: 'test-jwt-hash-token-12345',
        expires: 1789822733280,
        email: 'pasien@amanah.id',
      });

      expect(url).toBe(
        'http://localhost:3000/auth/sign-in/reset-password?hash=test-jwt-hash-token-12345&expires=1789822733280&email=pasien%40amanah.id',
      );
    });

    it('should strictly NOT contain the legacy path /password-change', () => {
      const url = mailService.buildResetPasswordUrl({
        hash: 'sample-token',
        expires: 123456789,
        email: 'user@example.com',
      });

      expect(url).not.toContain('/password-change');
      expect(url).toContain('/auth/sign-in/reset-password');
    });

    it('should normalize paths missing a leading slash', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'auth.resetPasswordPath') {
          return 'auth/sign-in/reset-password'; // missing leading slash
        }
        return undefined;
      });

      const url = mailService.buildResetPasswordUrl({
        hash: 'tok123',
        expires: 999999,
      });

      expect(url).toContain(
        'http://localhost:3000/auth/sign-in/reset-password?',
      );
    });

    it('should respect custom AUTH_RESET_PASSWORD_PATH from configuration', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'auth.resetPasswordPath') {
          return '/portal/auth/new-password';
        }
        return undefined;
      });

      const url = mailService.buildResetPasswordUrl({
        hash: 'custom-hash',
        expires: 123456,
        email: 'doctor@amanah.id',
      });

      expect(url).toBe(
        'http://localhost:3000/portal/auth/new-password?hash=custom-hash&expires=123456&email=doctor%40amanah.id',
      );
    });

    it('should properly encode email special characters in query parameters', () => {
      const url = mailService.buildResetPasswordUrl({
        hash: 'token',
        expires: 1000,
        email: 'test+patient.special@amanah.id',
      });

      expect(url).toContain('email=test%2Bpatient.special%40amanah.id');
    });
  });

  describe('forgotPassword dispatch', () => {
    it('should dispatch email with the SSOT canonical reset URL in context', async () => {
      const sendSpy = jest
        .spyOn(mailService, 'send')
        .mockResolvedValue(undefined);

      await mailService.forgotPassword({
        to: 'pasien@amanah.id',
        data: {
          hash: 'dispatch-token-xyz',
          tokenExpires: 1789822733280,
        },
      });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.to).toBe('pasien@amanah.id');
      expect(callArgs.subject).toBe('Reset password');
      expect(callArgs.template).toBe('reset-password');
      expect((callArgs.data as any).url).toBe(
        'http://localhost:3000/auth/sign-in/reset-password?hash=dispatch-token-xyz&expires=1789822733280&email=pasien%40amanah.id',
      );
      expect(callArgs.text).toContain(
        'http://localhost:3000/auth/sign-in/reset-password?hash=dispatch-token-xyz&expires=1789822733280&email=pasien%40amanah.id',
      );
    });
  });
});

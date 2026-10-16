import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { AllConfigType } from '../../config/config.type';
import { AUTH_ERROR_CODES } from '../constants/auth.constants';

export interface VerifiedGoogleUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  emailVerified: boolean;
}

@Injectable()
export class GoogleTokenVerifierService {
  private readonly logger = new Logger(GoogleTokenVerifierService.name);
  private readonly client: OAuth2Client;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    this.client = new OAuth2Client();
  }

  async verify(idToken: string): Promise<VerifiedGoogleUser> {
    if (!idToken || typeof idToken !== 'string') {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_TOKEN,
        message: 'Token Google tidak disertakan atau format tidak valid',
      });
    }

    const configuredClientId = this.configService.get('auth.googleClientId', {
      infer: true,
    });

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: configuredClientId ? [configuredClientId] : undefined,
      });

      const payload: TokenPayload | undefined = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.INVALID_TOKEN,
          message: 'Payload token Google tidak valid atau tidak memiliki email',
        });
      }

      if (!payload.email_verified) {
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
          message: 'Email Google belum diverifikasi',
        });
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        name: payload.name,
        picture: payload.picture,
        emailVerified: Boolean(payload.email_verified),
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.warn(`Failed to verify Google ID token: ${err?.message}`);
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_TOKEN,
        message: 'Verifikasi token Google gagal atau kedaluwarsa',
      });
    }
  }
}

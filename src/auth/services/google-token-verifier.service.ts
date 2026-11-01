import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { AUTH_ERROR_CODES } from '../../common/constants/auth-error-codes.constants';
import type { AllConfigType } from '../../config/config.type';

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
    const clientId = this.configService.get('auth.googleClientId', {
      infer: true,
    });
    const clientSecret = this.configService.get('auth.googleClientSecret', {
      infer: true,
    });
    this.client = new OAuth2Client(clientId, clientSecret);
  }

  async verifyOrExchangeCode(params: {
    idToken?: string;
    code?: string;
    redirectUri?: string;
  }): Promise<VerifiedGoogleUser> {
    if (params.code) {
      try {
        const { tokens } = await this.client.getToken({
          code: params.code,
          redirect_uri: params.redirectUri,
        });

        if (!tokens.id_token) {
          throw new UnauthorizedException({
            code: AUTH_ERROR_CODES.INVALID_TOKEN,
            message:
              'Google tidak mengembalikan ID token yang valid dari Authorization Code',
          });
        }

        return this.verify(tokens.id_token);
      } catch (err: any) {
        if (err instanceof UnauthorizedException) {
          throw err;
        }
        this.logger.warn(
          `Failed to exchange Google OAuth code: ${err?.message}`,
        );
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.INVALID_TOKEN,
          message: 'Kode otorisasi Google tidak valid atau telah kedaluwarsa',
        });
      }
    }

    if (params.idToken) {
      return this.verify(params.idToken);
    }

    throw new UnauthorizedException({
      code: AUTH_ERROR_CODES.INVALID_TOKEN,
      message: 'ID token atau Authorization code Google wajib disertakan',
    });
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
      if (!payload?.email) {
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

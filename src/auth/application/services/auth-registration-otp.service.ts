import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { RedisService } from '../../../common/redis/redis.service';
import { AllConfigType } from '../../../config/config.type';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  roles,
  session,
  user,
  userRoles,
  users,
} from '../../../database/schema';
import { MailService } from '../../../mail/mail.service';
import { auth } from '../../better-auth/auth';
import { AuthRegisterLoginDto } from '../../dto/auth-register-login.dto';
import {
  AuthResendOtpDto,
  ResendOtpResponseDto,
} from '../../dto/auth-resend-otp.dto';
import { AuthResetPasswordOtpDto } from '../../dto/auth-reset-password-otp.dto';
import { AuthVerifyOtpDto } from '../../dto/auth-verify-otp.dto';

@Injectable()
export class AuthRegistrationOtpService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async register(dto: AuthRegisterLoginDto): Promise<void> {
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (existingUser) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'emailAlreadyExists',
        },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();

    const [newUser] = await this.db
      .insert(users)
      .values({
        name: fullName,
        email: dto.email,
        emailVerified: true,
        status: 'active',
        preferredLocale: 'id-ID',
      })
      .returning();

    await this.db.insert(authAccounts).values({
      userId: newUser.id,
      providerId: 'credential',
      accountId: dto.email,
      passwordHash,
    });

    const patientRole = await this.db.query.roles.findFirst({
      where: eq(roles.code, 'patient'),
    });

    if (patientRole) {
      await this.db.insert(userRoles).values({
        userId: newUser.id,
        roleId: patientRole.id,
      });
    }

    try {
      await this.db.insert(user).values({
        id: newUser.id,
        name: fullName,
        email: dto.email,
        emailVerified: true,
        role: 'patient',
        banned: false,
      });

      await this.db.insert(account).values({
        accountId: newUser.id,
        providerId: 'credential',
        userId: newUser.id,
        password: passwordHash,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Better auth sync is complementary
    }
  }

  async confirmEmail(hash: string): Promise<void> {
    let payload: { id: string; email: string };
    try {
      payload = await this.jwtService.verifyAsync(hash, {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: 'invalidHash',
        },
      });
    }

    await this.db
      .update(users)
      .set({
        emailVerified: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, payload.id));
  }

  async confirmNewEmail(hash: string): Promise<void> {
    let payload: { id: string; email: string; newEmail?: string };
    try {
      payload = await this.jwtService.verifyAsync(hash, {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: 'invalidHash',
        },
      });
    }

    const emailToSet =
      payload.newEmail !== undefined ? payload.newEmail : payload.email;
    await this.db
      .update(users)
      .set({
        email: emailToSet,
        emailVerified: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, payload.id));
  }

  async forgotPassword(email: string): Promise<void> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!userRecord) {
      // Anti-enumeration: return cleanly without throwing to prevent email probing
      return;
    }

    const tokenExpires = Date.now() + 1800000; // 30 minutes
    const hash = await this.jwtService.signAsync(
      {
        id: userRecord.id,
        email: userRecord.email,
      },
      {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
        expiresIn: '30m',
      },
    );

    await this.mailService.forgotPassword({
      to: email,
      data: {
        hash,
        tokenExpires,
      },
    });
  }

  async resetPassword(hash: string, password: string): Promise<void> {
    let payload: { id: string; email: string };
    try {
      payload = await this.jwtService.verifyAsync(hash, {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: 'invalidHash',
        },
      });
    }

    const tokenUsedKey = `used_reset_token:${hash}`;
    const isSingleUse = await this.redisService.setNx(tokenUsedKey, '1', 1800);
    if (!isSingleUse) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: 'invalidHash',
        },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const credentialAccount = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.userId, payload.id),
        eq(authAccounts.providerId, 'credential'),
      ),
    });

    if (credentialAccount) {
      await this.db
        .update(authAccounts)
        .set({
          passwordHash,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(authAccounts.userId, payload.id),
            eq(authAccounts.providerId, 'credential'),
          ),
        );
    } else {
      await this.db.insert(authAccounts).values({
        userId: payload.id,
        providerId: 'credential',
        accountId: payload.email,
        passwordHash,
      });
    }

    try {
      const [betterAccount] = await this.db
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, payload.id),
            eq(account.providerId, 'credential'),
          ),
        )
        .limit(1);

      if (betterAccount) {
        await this.db
          .update(account)
          .set({
            password: passwordHash,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(account.userId, payload.id),
              eq(account.providerId, 'credential'),
            ),
          );
      } else {
        await this.db.insert(account).values({
          accountId: payload.id,
          providerId: 'credential',
          userId: payload.id,
          password: passwordHash,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Complementary sync
    }

    try {
      await this.db.delete(session).where(eq(session.userId, payload.id));
    } catch {
      // Non-blocking session revocation
    }
  }

  async resendOtp(dto: AuthResendOtpDto): Promise<ResendOtpResponseDto> {
    const cooldownKey = `cooldown:otp:${dto.type}:${dto.email}`;
    const remainingTtl = await this.redisService.getTtl(cooldownKey);

    if (remainingTtl > 0) {
      throw new HttpException(
        {
          message: `Mohon tunggu ${remainingTtl} detik sebelum meminta kode baru.`,
          code: 'RESEND_COOLDOWN_ACTIVE',
          retryAfter: remainingTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const rateLimit = await this.redisService.consumeRateLimit(
      `resend_burst:${dto.type}:${dto.email}`,
      5,
      900,
    );

    if (!rateLimit.allowed) {
      throw new HttpException(
        {
          message:
            'Batas permintaan kode OTP tercapai. Silakan coba lagi nanti.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimit.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.redisService.setString(cooldownKey, '1', 60);

    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (!userRecord) {
      return {
        success: true,
        message:
          'Jika email terdaftar, kode verifikasi baru telah dikirim ke email Anda.',
        cooldownSeconds: 60,
      };
    }

    if (dto.type === 'email-verification' && userRecord.emailVerified) {
      return {
        success: true,
        message: 'Alamat email ini sudah diverifikasi.',
        cooldownSeconds: 0,
      };
    }

    try {
      const betterAuthType =
        dto.type === 'forgot-password'
          ? 'forget-password'
          : 'email-verification';
      await auth.api.sendVerificationOTP({
        body: {
          email: dto.email,
          type: betterAuthType as any,
        },
      });
    } catch {
      // Non-blocking fallback
    }

    if (dto.type === 'forgot-password') {
      try {
        const tokenExpires = Date.now() + 1800000;
        const hash = await this.jwtService.signAsync(
          {
            id: userRecord.id,
            email: userRecord.email,
          },
          {
            secret: this.configService.getOrThrow('auth.forgotSecret', {
              infer: true,
            }),
            expiresIn: '30m',
          },
        );

        await this.mailService.forgotPassword({
          to: dto.email,
          data: {
            hash,
            tokenExpires,
          },
        });
      } catch {
        // Complementary
      }
    }

    return {
      success: true,
      message: 'Kode OTP baru berhasil dikirim ke email Anda.',
      cooldownSeconds: 60,
    };
  }

  async verifyEmailOtp(
    dto: AuthVerifyOtpDto,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await auth.api.verifyEmailOTP({
        body: {
          email: dto.email,
          otp: dto.otp,
        },
      });
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          otp: 'invalidOrExpiredOtp',
        },
      });
    }

    await this.db
      .update(users)
      .set({
        emailVerified: true,
        status: 'active',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.email, dto.email));

    return {
      success: true,
      message: 'Email berhasil diverifikasi.',
    };
  }

  async resetPasswordWithOtp(dto: AuthResetPasswordOtpDto): Promise<void> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (!userRecord) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'userNotFound',
        },
      });
    }

    try {
      await auth.api.resetPasswordEmailOTP({
        body: {
          email: dto.email,
          otp: dto.otp,
          password: dto.password,
        },
      });
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          otp: 'invalidOrExpiredOtp',
        },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const credentialAccount = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.userId, userRecord.id),
        eq(authAccounts.providerId, 'credential'),
      ),
    });

    if (credentialAccount) {
      await this.db
        .update(authAccounts)
        .set({
          passwordHash,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(authAccounts.userId, userRecord.id),
            eq(authAccounts.providerId, 'credential'),
          ),
        );
    } else {
      await this.db.insert(authAccounts).values({
        userId: userRecord.id,
        providerId: 'credential',
        accountId: dto.email,
        passwordHash,
      });
    }

    try {
      await this.db.delete(session).where(eq(session.userId, userRecord.id));
    } catch {
      // Non-blocking
    }
  }
}

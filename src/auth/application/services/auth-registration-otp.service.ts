import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { createHash, randomInt } from 'node:crypto';
import { AUTH_PROVIDER } from '../../../common/constants/auth-providers.constants';
import { ROLE_AUDIENCE } from '../../../common/constants/role-audience.constants';
import { RedisService } from '../../../common/redis/redis.service';
import { AllConfigType } from '../../../config/config.type';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  authSessions,
  authVerifications,
  roles,
  session,
  staffProfiles,
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
import { RequestEmailChangeDto } from '../../dto/request-email-change.dto';
import { VerifyEmailChangeDto } from '../../dto/verify-email-change.dto';
import { IdentityEnrollmentService } from './identity-enrollment.service';
import { UserProvisionedNotificationPublisher } from '../publishers/user-provisioned-notification.publisher';
import { SocketIoRealtimeGateway } from '../../../modules/notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { REALTIME_ROOMS } from '../../../modules/notifications/notifications.constants';
import { Optional } from '@nestjs/common';

@Injectable()
export class AuthRegistrationOtpService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly identityEnrollmentService: IdentityEnrollmentService,
    @Optional()
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    private readonly userProvisionedNotificationPublisher?: UserProvisionedNotificationPublisher,
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

    // Enforce fail-closed identity enrollment before creating user record
    const externalRole =
      await this.identityEnrollmentService.resolveExternalRegistrationRole();

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

    await this.db.insert(userRoles).values({
      userId: newUser.id,
      roleId: externalRole.id,
    });

    if (this.userProvisionedNotificationPublisher) {
      void this.userProvisionedNotificationPublisher.publishUserProvisioned({
        userId: newUser.id,
        name: fullName,
        email: dto.email,
        roleId: externalRole.id,
        roleName: externalRole.name,
        roleCode: externalRole.code,
        audience: externalRole.audience,
        avatarUrl: null,
      });
    } else {
      void this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'roles:updated',
        { roleId: externalRole.id, action: 'user_registered' },
      );
    }

    try {
      await this.db.insert(user).values({
        id: newUser.id,
        name: fullName,
        email: dto.email,
        emailVerified: true,
        role: null,
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

  async requestEmailChange(
    userId: string,
    dto: RequestEmailChangeDto,
  ): Promise<{ success: boolean; message: string }> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    const newEmail = dto.newEmail.trim().toLowerCase();
    if (newEmail === userRecord.email.toLowerCase()) {
      throw new BadRequestException(
        'Alamat email baru tidak boleh sama dengan email akun saat ini.',
      );
    }

    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.email, newEmail),
    });
    if (existingUser) {
      throw new ConflictException(
        'Alamat email tersebut sudah terdaftar pada akun lain di sistem.',
      );
    }

    // Cooldown check (60s) via Redis
    const cooldownKey = `email_change_cooldown:${userId}`;
    const inCooldown = await this.redisService.getString(cooldownKey);
    if (inCooldown) {
      throw new HttpException(
        {
          message:
            'Mohon tunggu 60 detik sebelum mengajukan kode OTP perubahan email baru.',
          code: 'COOLDOWN_ACTIVE',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const credentialAcc = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.userId, userId),
        eq(authAccounts.providerId, AUTH_PROVIDER.CREDENTIAL),
      ),
    });

    if (!credentialAcc?.passwordHash) {
      throw new BadRequestException(
        'Akun ini terhubung menggunakan Google OAuth tanpa kata sandi lokal. Silakan gunakan opsi Ganti Akun Google untuk memperbarui email Anda.',
      );
    }

    if (!dto.currentPassword) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message:
          'Kata sandi saat ini wajib diisi untuk mengonfirmasi perubahan alamat email.',
        errors: {
          currentPassword:
            'Kata sandi saat ini wajib diisi untuk mengonfirmasi perubahan alamat email.',
        },
      });
    }
    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      credentialAcc.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Kata sandi saat ini tidak cocok',
        errors: {
          currentPassword: 'Kata sandi saat ini tidak cocok',
        },
      });
    }



    // Generate 6-digit numeric OTP
    const otp = randomInt(100000, 1000000).toString();
    const identifierHash = createHash('sha256')
      .update(`${userId}:${newEmail}`)
      .digest('hex');
    const valueHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Clean up any stale email_change verification for this identifier
    await this.db
      .delete(authVerifications)
      .where(
        and(
          eq(authVerifications.identifierHash, identifierHash),
          eq(authVerifications.purpose, 'email_change'),
        ),
      );

    // Insert new pending OTP record
    await this.db.insert(authVerifications).values({
      identifierHash,
      valueHash,
      purpose: 'email_change',
      expiresAt,
      attemptCount: 0,
    });

    // Set cooldown in Redis
    await this.redisService.setString(cooldownKey, '1', 60);

    // Send email with OTP
    await this.mailService.send({
      to: newEmail,
      subject: 'Kode OTP Perubahan Email - Amanah Healthcare',
      text: `Halo,\n\nGunakan kode OTP berikut untuk mengonfirmasi pemindahan alamat email akun Amanah Healthcare Anda:\n\nKode OTP: ${otp}\n(Berlaku 5 menit)\n\nJika Anda tidak merasa mengajukan perubahan ini, abaikan email ini.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0;">Verifikasi Perubahan Email</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.5;">Gunakan kode OTP berikut untuk mengonfirmasi pemindahan alamat email akun Amanah Healthcare Anda ke alamat ini:</p>
          <div style="background-color: #f1f5f9; border-radius: 6px; padding: 16px; text-align: center; margin: 24px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0284c7;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.4;">Kode OTP ini berlaku selama <strong>5 menit</strong>. Jangan berikan kode ini kepada siapapun.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">Amanah Healthcare — Sistem Informasi & Operasional Klinik Terpadu</p>
        </div>
      `,
    });

    return {
      success: true,
      message: `Kode OTP verifikasi telah dikirim ke ${newEmail}. Silakan periksa kotak masuk untuk menyelesaikan perubahan email.`,
    };
  }

  async verifyEmailChange(
    userId: string,
    dto: VerifyEmailChangeDto,
  ): Promise<{ success: boolean; message: string }> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    const newEmail = dto.newEmail.trim().toLowerCase();
    const conflictUser = await this.db.query.users.findFirst({
      where: and(eq(users.email, newEmail), sql`id != ${userId}::uuid`),
    });

    if (conflictUser) {
      throw new ConflictException(
        'Alamat email tersebut sudah terdaftar pada akun lain di sistem.',
      );
    }

    const identifierHash = createHash('sha256')
      .update(`${userId}:${newEmail}`)
      .digest('hex');

    const verificationRecord = await this.db.query.authVerifications.findFirst({
      where: and(
        eq(authVerifications.identifierHash, identifierHash),
        eq(authVerifications.purpose, 'email_change'),
        isNull(authVerifications.consumedAt),
      ),
      orderBy: [desc(authVerifications.createdAt)],
    });

    if (!verificationRecord) {
      throw new BadRequestException(
        'Permintaan verifikasi perubahan email tidak ditemukan atau telah kedaluwarsa. Silakan ajukan ulang.',
      );
    }

    if (new Date(verificationRecord.expiresAt) < new Date()) {
      throw new BadRequestException(
        'Kode OTP telah kedaluwarsa. Silakan minta kode OTP baru.',
      );
    }

    if (verificationRecord.attemptCount >= 5) {
      throw new BadRequestException(
        'Batas percobaan verifikasi telah terlampaui. Silakan minta kode OTP baru.',
      );
    }

    const isValidOtp = await bcrypt.compare(
      dto.otp.trim(),
      verificationRecord.valueHash,
    );

    if (!isValidOtp) {
      await this.db
        .update(authVerifications)
        .set({
          attemptCount: sql`attempt_count + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(authVerifications.id, verificationRecord.id));

      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          otp: 'Kode OTP yang dimasukkan tidak cocok.',
        },
      });
    }

    const oldEmail = userRecord.email;
    const nowIso = new Date().toISOString();

    await this.db.transaction(async (tx) => {
      // 1. Update authoritative users table (email, verified, increment auth_version)
      await tx
        .update(users)
        .set({
          email: newEmail,
          emailVerified: true,
          authVersion: sql`auth_version + 1`,
          updatedAt: nowIso,
        })
        .where(eq(users.id, userId));

      // 2. Update credential auth_accounts (if user has credential provider)
      await tx
        .update(authAccounts)
        .set({
          accountId: newEmail,
          updatedAt: nowIso,
        })
        .where(
          and(
            eq(authAccounts.userId, userId),
            eq(authAccounts.providerId, AUTH_PROVIDER.CREDENTIAL),
          ),
        );

      // 3. Update Better-Auth tables
      try {
        await tx
          .update(user)
          .set({
            email: newEmail,
            updatedAt: nowIso,
          })
          .where(eq(user.id, userId));

        await tx
          .update(account)
          .set({
            accountId: newEmail,
            updatedAt: nowIso,
          })
          .where(
            and(
              eq(account.userId, userId),
              eq(account.providerId, AUTH_PROVIDER.CREDENTIAL),
            ),
          );
      } catch {
        // Non-blocking
      }

      // 4. Update staff_profiles table (synced by userId)
      await tx
        .update(staffProfiles)
        .set({
          email: newEmail,
          updatedAt: nowIso,
        })
        .where(eq(staffProfiles.userId, userId));

      // 5. Revoke all active sessions in auth_sessions
      await tx
        .update(authSessions)
        .set({
          revokedAt: nowIso,
        })
        .where(
          and(
            eq(authSessions.userId, userId),
            isNull(authSessions.revokedAt),
          ),
        );

      // 6. Delete Better-Auth sessions
      try {
        await tx.delete(session).where(eq(session.userId, userId));
      } catch {
        // Non-blocking
      }

      // 7. Mark verification as consumed
      await tx
        .update(authVerifications)
        .set({
          consumedAt: nowIso,
          updatedAt: nowIso,
        })
        .where(eq(authVerifications.id, verificationRecord.id));
    });

    // 8. Purge Redis user data & permission caches
    await this.redisService.purgeUserData(userId, oldEmail);
    await this.redisService.purgeUserData(userId, newEmail);

    // 9. Send security alert notification to old email
    try {
      await this.mailService.send({
        to: oldEmail,
        subject:
          'Pemberitahuan Keamanan: Alamat Email Akun Telah Dipindahkan',
        text: `Halo ${userRecord.name},\n\nAlamat email untuk akun Amanah Healthcare Anda telah berhasil dialihkan ke: ${newEmail}.\n\nSeluruh sesi login sebelumnya telah dinonaktifkan demi keamanan akun Anda. Jika Anda tidak merasa melakukan tindakan ini, segera hubungi tim administrator sistem.`,
      });
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      message:
        'Alamat email akun berhasil diperbarui. Seluruh sesi login sebelumnya telah dinonaktifkan demi keamanan. Silakan masuk kembali.',
    };
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
        updatedAt: sql`NOW()`,
      })
      .where(eq(users.id, payload.id));

    await this.db
      .update(authAccounts)
      .set({
        accountId: emailToSet,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(authAccounts.userId, payload.id),
          eq(authAccounts.providerId, AUTH_PROVIDER.CREDENTIAL),
        ),
      );

    try {
      await this.db
        .update(user)
        .set({
          email: emailToSet,
          updatedAt: sql`NOW()`,
        })
        .where(eq(user.id, payload.id));

      await this.db
        .update(account)
        .set({
          accountId: emailToSet,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(account.userId, payload.id),
            eq(account.providerId, AUTH_PROVIDER.CREDENTIAL),
          ),
        );
    } catch {
      // Complementary Better-Auth table
    }

    await this.redisService.purgeUserData(payload.id, payload.email);

    if (payload.email && payload.email !== emailToSet) {
      try {
        await this.mailService.send({
          to: payload.email,
          subject:
            'Pemberitahuan Keamanan: Alamat Email Akun Telah Dipindahkan',
          text: `Halo,\n\nAlamat email untuk akun Amanah Healthcare Anda telah berhasil dialihkan ke: ${emailToSet}.\n\nJika Anda tidak merasa mengajukan pemindahan ini, segera hubungi tim administrator sistem.`,
        });
      } catch {
        // Non-blocking
      }
    }
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

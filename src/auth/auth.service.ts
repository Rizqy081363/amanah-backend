import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { AllConfigType } from '../config/config.type';
import { DRIZZLE_SOURCE } from '../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  practitioners,
  roles,
  session,
  staffProfiles,
  user,
  userRoles,
  users,
} from '../database/schema';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../common/redis/redis.service';
import { auth } from './better-auth/auth';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { AuthResendOtpDto, ResendOtpResponseDto } from './dto/auth-resend-otp.dto';
import { AuthResetPasswordOtpDto } from './dto/auth-reset-password-otp.dto';
import {
  AuthStaffOnboardingDto,
  StaffOnboardingRole,
} from './dto/auth-staff-onboarding.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthVerifyOtpDto } from './dto/auth-verify-otp.dto';
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import type { JwtPayloadType } from './strategies/types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async validateLogin(loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, loginDto.email),
      with: {
        authAccounts: true,
        userRoles_userId: {
          with: {
            role: true,
          },
        },
        staffProfiles: {
          with: {
            practitioners: true,
          },
        },
        patientProfiles: {
          with: {
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'notFound',
        },
      });
    }

    const credentialAccount = user.authAccounts?.find(
      (acc) => acc.providerId === 'credential',
    );

    if (!credentialAccount?.passwordHash) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          password: 'incorrectPassword',
        },
      });
    }

    const isValidPassword = await bcrypt.compare(
      loginDto.password,
      credentialAccount.passwordHash,
    );

    if (!isValidPassword) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          password: 'incorrectPassword',
        },
      });
    }

    await this.db
      .update(users)
      .set({
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));

    const primaryRole = user.userRoles_userId?.[0]?.role;
    let systemRole: 'ADMIN' | 'STAF' | 'PATIENT' = 'PATIENT';
    if (primaryRole?.code === 'admin') {
      systemRole = 'ADMIN';
    } else if (
      primaryRole?.code === 'staff_doctor' ||
      primaryRole?.code === 'staff_midwife' ||
      primaryRole?.code === 'staff_worker' ||
      (user.staffProfiles && user.staffProfiles.length > 0)
    ) {
      systemRole = 'STAF';
    }

    const tokenExpiresIn =
      this.configService.get('auth.expires', { infer: true }) || '1d';

    const token = await this.jwtService.signAsync(
      {
        id: user.id,
        email: user.email,
        systemRole,
        role: {
          id: primaryRole?.id,
          name: systemRole,
        },
      },
      {
        secret: this.configService.getOrThrow('auth.secret', { infer: true }),
        expiresIn: tokenExpiresIn,
      },
    );

    const refreshTokenExpiresIn =
      this.configService.get('auth.refreshExpires', { infer: true }) || '7d';

    const refreshToken = await this.jwtService.signAsync(
      {
        sessionId: user.id,
        hash: 'session_hash',
        id: user.id,
        role: {
          id: primaryRole?.id,
          name: systemRole,
        },
      },
      {
        secret: this.configService.getOrThrow('auth.refreshSecret', {
          infer: true,
        }),
        expiresIn: refreshTokenExpiresIn,
      },
    );

    return {
      token,
      refreshToken,
      tokenExpires: Date.now() + 86400000,
      user: this.formatUser(user) as any,
    };
  }

  private formatUser(userRecord: any) {
    const { authAccounts: _authAccounts, ...sanitizedUser } = userRecord;

    const primaryRole = sanitizedUser.userRoles_userId?.[0]?.role;
    let systemRole: 'ADMIN' | 'STAF' | 'PATIENT' = 'PATIENT';
    if (primaryRole?.code === 'admin') {
      systemRole = 'ADMIN';
    } else if (
      primaryRole?.code === 'staff_doctor' ||
      primaryRole?.code === 'staff_midwife' ||
      primaryRole?.code === 'staff_worker' ||
      (sanitizedUser.staffProfiles && sanitizedUser.staffProfiles.length > 0)
    ) {
      systemRole = 'STAF';
    }

    const p = sanitizedUser.patientProfiles?.[0];
    const primaryAddress =
      p?.patientAddresses?.find((a: any) => a.isPrimary) ||
      p?.patientAddresses?.[0];
    const primaryEmergency = p?.patientEmergencyContacts?.[0];

    const patient = p
      ? {
          id: p.id,
          userId: p.userId,
          medicalRecordNumber: p.medicalRecordNumber,
          nik: p.nationalIdEncrypted || p.nationalIdHash || '',
          fullName: p.fullName,
          gender: p.gender === 'female' ? 'Perempuan' : 'Laki-laki',
          birthPlace: p.birthPlace,
          birthDate:
            typeof p.birthDate === 'string'
              ? p.birthDate
              : p.birthDate?.toISOString?.()?.slice(0, 10) || null,
          bloodType:
            p.bloodType === 'unknown'
              ? 'Belum Tahu'
              : (p.bloodType?.toUpperCase() ?? p.bloodType ?? null),
          phoneNumber: p.phone,
          namaIbuKandung: p.motherName || null,
          pekerjaan: p.occupation || null,
          address: primaryAddress?.fullAddress || '',
          alamatDetail: primaryAddress?.line1 || null,
          provinsi: primaryAddress?.provinceName || null,
          provinsiId: primaryAddress?.provinceCode || null,
          kabupaten: primaryAddress?.regencyName || null,
          kabupatenId: primaryAddress?.regencyCode || null,
          kecamatan: primaryAddress?.districtName || null,
          kecamatanId: primaryAddress?.districtCode || null,
          kelurahan: primaryAddress?.villageName || null,
          kelurahanId: primaryAddress?.villageCode || null,
          emergencyContactName: primaryEmergency?.name || null,
          emergencyContactPhone: primaryEmergency?.phone || null,
          emergencyContactRelationship: primaryEmergency?.relationship || null,
          status: p.status,
        }
      : null;

    const s = sanitizedUser.staffProfiles?.[0];
    const staff = s
      ? {
          id: s.id,
          userId: s.userId,
          practitionerId: s.practitioners?.[0]?.id || s.practitionerId || null,
          poliklinikId: s.primaryUnitId || s.poliklinikId || null,
          fullName: s.fullName,
          profession: s.positionTitle || s.profession || null,
          idCardNumber: s.staffCode || s.idCardNumber || null,
          photoUrl: s.avatarUrl || s.photoUrl || null,
          phoneNumber: s.phone,
          isActive: s.status === 'active',
        }
      : null;

    const needsOnboarding = systemRole !== 'ADMIN' && !staff;

    return {
      ...sanitizedUser,
      systemRole,
      role: {
        id: primaryRole?.id,
        code: primaryRole?.code,
        name: systemRole,
      },
      staff,
      patient,
      needsOnboarding,
    };
  }

  async me(userJwtPayload: any): Promise<any> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userJwtPayload.id),
      with: {
        userRoles_userId: {
          with: {
            role: true,
          },
        },
        staffProfiles: {
          with: {
            practitioners: true,
          },
        },
        patientProfiles: {
          with: {
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
      },
    });
    return user ? this.formatUser(user) : null;
  }

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

    const emailToSet = payload.newEmail || payload.email;
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
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      // Anti-enumeration: return cleanly without throwing to prevent email probing
      return;
    }

    const tokenExpires = Date.now() + 1800000; // 30 minutes
    const hash = await this.jwtService.signAsync(
      {
        id: user.id,
        email: user.email,
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

    // Atomic replay protection: single-use token enforcement via Redis with 30-minute TTL (1800s)
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

    // Revoke all active Better Auth sessions upon password reset
    try {
      await this.db.delete(session).where(eq(session.userId, payload.id));
    } catch {
      // Non-blocking session revocation
    }
  }

  async update(
    userJwtPayload: JwtPayloadType,
    userDto: AuthUpdateDto,
  ): Promise<any> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userJwtPayload.id),
    });

    if (!userRecord) {
      throw new UnauthorizedException();
    }

    const updateFields: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (userDto.firstName || userDto.lastName) {
      const currentNameParts = userRecord.name
        ? userRecord.name.split(' ')
        : [];
      const first = userDto.firstName ?? currentNameParts[0] ?? '';
      const last =
        userDto.lastName ?? currentNameParts.slice(1).join(' ') ?? '';
      updateFields.name = `${first} ${last}`.trim();
    }

    if (userDto.password) {
      if (!userDto.oldPassword) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            oldPassword: 'missingOldPassword',
          },
        });
      }

      const credentialAcc = await this.db.query.authAccounts.findFirst({
        where: and(
          eq(authAccounts.userId, userRecord.id),
          eq(authAccounts.providerId, 'credential'),
        ),
      });

      if (!credentialAcc?.passwordHash) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            oldPassword: 'incorrectOldPassword',
          },
        });
      }

      const isOldPasswordValid = await bcrypt.compare(
        userDto.oldPassword,
        credentialAcc.passwordHash,
      );

      if (!isOldPasswordValid) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            oldPassword: 'incorrectOldPassword',
          },
        });
      }

      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(userDto.password, salt);

      await this.db
        .update(authAccounts)
        .set({
          passwordHash: newHash,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(authAccounts.userId, userRecord.id),
            eq(authAccounts.providerId, 'credential'),
          ),
        );

      try {
        await this.db
          .update(account)
          .set({
            password: newHash,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(account.userId, userRecord.id),
              eq(account.providerId, 'credential'),
            ),
          );
      } catch {
        // Complementary
      }
    }

    if (Object.keys(updateFields).length > 1) {
      await this.db
        .update(users)
        .set(updateFields)
        .where(eq(users.id, userRecord.id));

      try {
        if (updateFields.name) {
          await this.db
            .update(user)
            .set({
              name: updateFields.name,
              updatedAt: updateFields.updatedAt,
            })
            .where(eq(user.id, userRecord.id));
        }
      } catch {
        // Complementary
      }
    }

    return this.me(userJwtPayload);
  }

  async refreshToken(data: any): Promise<any> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, String(data.sessionId)),
      with: {
        userRoles_userId: {
          with: {
            role: true,
          },
        },
        staffProfiles: {
          with: {
            practitioners: true,
          },
        },
        patientProfiles: {
          with: {
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const primaryRole = user.userRoles_userId?.[0]?.role;
    let systemRole: 'ADMIN' | 'STAF' | 'PATIENT' = 'PATIENT';
    if (primaryRole?.code === 'admin') {
      systemRole = 'ADMIN';
    } else if (
      primaryRole?.code === 'staff_doctor' ||
      primaryRole?.code === 'staff_midwife' ||
      primaryRole?.code === 'staff_worker' ||
      (user.staffProfiles && user.staffProfiles.length > 0)
    ) {
      systemRole = 'STAF';
    }

    const tokenExpiresIn =
      this.configService.get('auth.expires', { infer: true }) || '1d';
    const token = await this.jwtService.signAsync(
      {
        id: user.id,
        email: user.email,
        systemRole,
        role: {
          id: primaryRole?.id,
          name: systemRole,
        },
      },
      {
        secret: this.configService.getOrThrow('auth.secret', { infer: true }),
        expiresIn: tokenExpiresIn,
      },
    );

    const refreshTokenExpiresIn =
      this.configService.get('auth.refreshExpires', { infer: true }) || '7d';
    const refreshToken = await this.jwtService.signAsync(
      {
        sessionId: user.id,
        hash: 'session_hash',
        id: user.id,
        role: {
          id: primaryRole?.id,
          name: systemRole,
        },
      },
      {
        secret: this.configService.getOrThrow('auth.refreshSecret', {
          infer: true,
        }),
        expiresIn: refreshTokenExpiresIn,
      },
    );

    return {
      token,
      refreshToken,
      tokenExpires: Date.now() + 86400000,
    };
  }

  async softDelete(userJwtPayload: JwtPayloadType): Promise<void> {
    await this.db
      .update(users)
      .set({
        status: 'inactive',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userJwtPayload.id));

    try {
      await this.db
        .update(user)
        .set({
          banned: true,
          banReason: 'Akun dinonaktifkan oleh pengguna',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(user.id, userJwtPayload.id));
    } catch {
      // Complementary
    }
  }

  async purgeAccount(
    userJwtPayload: JwtPayloadType,
  ): Promise<DeleteAccountResponseDto> {
    const userId = userJwtPayload.id;
    let email = userJwtPayload.email;

    if (!email) {
      const userRecord = await this.db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      email = userRecord?.email;
    }

    try {
      await this.db.execute(sql`SELECT purge_user_systemic(${userId})`);
      if (email) {
        await this.db.execute(sql`SELECT purge_user_systemic(${email})`);
      }
    } catch (error) {
      await this.softDelete(userJwtPayload);
      throw new HttpException(
        {
          message: 'Gagal membersihkan data akun secara sistemik.',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (this.redisService) {
      await this.redisService.purgeUserData(userId, email);
    }

    return {
      success: true,
      message:
        'Akun dan seluruh data pengguna terkait telah berhasil dihapus secara permanen dari sistem.',
      purgedAt: new Date().toISOString(),
      details: {
        userId,
        email,
      },
    };
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

    // Rate limiting: maximum 5 resend requests per 15 minutes per email
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

    // Set 60 seconds cooldown in Redis
    await this.redisService.setString(cooldownKey, '1', 60);

    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (!userRecord) {
      // Anti-enumeration: Return success message without revealing absence
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

    // If type is forgot-password, also trigger link refresh
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

  async completeStaffOnboarding(
    userJwtPayload: JwtPayloadType,
    dto: AuthStaffOnboardingDto,
  ): Promise<any> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userJwtPayload.id),
      with: {
        userRoles_userId: true,
        staffProfiles: true,
      },
    });

    if (!userRecord) {
      throw new UnauthorizedException('Pengguna tidak ditemukan di sistem.');
    }

    let betterAuthRole: 'staffDoctor' | 'staffMidwife' | 'staffWorker' =
      'staffDoctor';
    let rolesCode: 'staff_doctor' | 'staff_midwife' | 'staff_worker' =
      'staff_doctor';
    let staffTypeVal: 'doctor' | 'midwife' | 'worker' = 'doctor';

    if (dto.role === StaffOnboardingRole.DOCTOR) {
      betterAuthRole = 'staffDoctor';
      rolesCode = 'staff_doctor';
      staffTypeVal = 'doctor';
    } else if (dto.role === StaffOnboardingRole.MIDWIFE) {
      betterAuthRole = 'staffMidwife';
      rolesCode = 'staff_midwife';
      staffTypeVal = 'midwife';
    } else {
      betterAuthRole = 'staffWorker';
      rolesCode = 'staff_worker';
      staffTypeVal = 'worker';
    }

    const defaultPrefix =
      staffTypeVal === 'doctor'
        ? 'STF-DOK'
        : staffTypeVal === 'midwife'
          ? 'STF-BDN'
          : 'STF-ADM';
    const finalStaffCode =
      dto.staffCode?.trim() ||
      `${defaultPrefix}-${Date.now().toString().slice(-4)}`;

    const positionTitle =
      dto.profession?.trim() ||
      (staffTypeVal === 'doctor'
        ? 'Dokter'
        : staffTypeVal === 'midwife'
          ? 'Bidan'
          : 'Staf Administrasi');

    await this.db.transaction(async (tx) => {
      // 1. Update Better Auth "user" table
      try {
        await tx
          .update(user)
          .set({
            role: betterAuthRole,
            name: dto.fullName.trim(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(user.id, userRecord.id));
      } catch {
        // Non-blocking if record is managed exclusively in users
      }

      // 2. Update users table
      await tx
        .update(users)
        .set({
          name: dto.fullName.trim(),
          phone: dto.phoneNumber?.trim() || userRecord.phone,
          status: 'active',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, userRecord.id));

      // 3. Update user_roles
      const targetRole = await tx.query.roles.findFirst({
        where: eq(roles.code, rolesCode),
      });

      if (targetRole) {
        await tx
          .delete(userRoles)
          .where(eq(userRoles.userId, userRecord.id));

        await tx.insert(userRoles).values({
          userId: userRecord.id,
          roleId: targetRole.id,
        });
      }

      // 4. Create or update staff_profiles
      let existingStaff = await tx.query.staffProfiles.findFirst({
        where: eq(staffProfiles.userId, userRecord.id),
      });

      if (existingStaff) {
        const [updated] = await tx
          .update(staffProfiles)
          .set({
            fullName: dto.fullName.trim(),
            staffCode: finalStaffCode,
            staffType: staffTypeVal,
            positionTitle,
            phone: dto.phoneNumber?.trim() || existingStaff.phone,
            primaryUnitId: dto.poliklinikId || existingStaff.primaryUnitId,
            status: 'active',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffProfiles.id, existingStaff.id))
          .returning();
        existingStaff = updated;
      } else {
        const [created] = await tx
          .insert(staffProfiles)
          .values({
            userId: userRecord.id,
            staffCode: finalStaffCode,
            fullName: dto.fullName.trim(),
            staffType: staffTypeVal,
            positionTitle,
            phone: dto.phoneNumber?.trim(),
            email: userRecord.email,
            primaryUnitId: dto.poliklinikId,
            status: 'active',
          })
          .returning();
        existingStaff = created;
      }

      // 5. If doctor, create or update practitioner record
      if (staffTypeVal === 'doctor' && existingStaff) {
        const existingPractitioner = await tx.query.practitioners.findFirst({
          where: eq(practitioners.staffProfileId, existingStaff.id),
        });

        if (!existingPractitioner) {
          await tx.insert(practitioners).values({
            staffProfileId: existingStaff.id,
            displayName: dto.fullName.trim(),
            licenseNumber: dto.licenseNumber?.trim() || null,
            isAcceptingAppointments: true,
          });
        } else if (dto.licenseNumber || dto.fullName) {
          await tx
            .update(practitioners)
            .set({
              displayName: dto.fullName.trim(),
              licenseNumber:
                dto.licenseNumber?.trim() || existingPractitioner.licenseNumber,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(practitioners.id, existingPractitioner.id));
        }
      }
    });

    return this.me(userJwtPayload);
  }

  async logout(data: {
    sessionId?: string;
    userId?: string;
    token?: string;
  }): Promise<void> {
    if (data.token) {
      // Blacklist token in Redis for 24 hours (86400s)
      await this.redisService.setString(
        `blacklist:token:${data.token}`,
        '1',
        86400,
      );
    }

    if (data.sessionId) {
      try {
        await this.db.delete(session).where(eq(session.id, data.sessionId));
      } catch {
        // Non-blocking
      }
    }

    if (data.userId) {
      try {
        await this.db.delete(session).where(eq(session.userId, data.userId));
      } catch {
        // Non-blocking
      }
    }
  }
}

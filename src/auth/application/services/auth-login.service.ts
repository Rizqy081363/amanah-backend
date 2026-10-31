import {
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
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
  authAccounts,
  roles,
  session,
  staffInvitations,
  userRoles,
  users,
} from '../../../database/schema';
import {
  STAFF_INVITATION_STATUS,
} from '../../../modules/staffs/domain/constants/staff-invitation.constants';
import {
  AUTH_ERROR_CODES,
  AUTH_SURFACES,
  ROLE_AUDIENCE,
  USER_STATUS,
} from '../../../common/constants';
import { AuthEmailLoginDto } from '../../dto/auth-email-login.dto';
import { AuthGoogleLoginDto } from '../../dto/auth-google-login.dto';
import { LoginResponseDto } from '../../dto/login-response.dto';
import { RefreshResponseDto } from '../../dto/refresh-response.dto';
import { GoogleTokenVerifierService } from '../../services/google-token-verifier.service';
import { AuthUserMapper } from '../mappers/auth-user.mapper';

@Injectable()
export class AuthLoginService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly redisService: RedisService,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly googleVerifier: GoogleTokenVerifierService,
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
            addresses: true,
            clinicUnit: true,
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

    if (user.status === USER_STATUS.INACTIVE) {
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
        message: 'Akun telah dinonaktifkan atau undangan telah dibatalkan.',
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

    const primaryRole = user.userRoles_userId?.[0]?.role ?? null;
    const roleCode = primaryRole?.code ?? null;
    const isExternalAudience = primaryRole?.audience === ROLE_AUDIENCE.EXTERNAL;

    if (loginDto.clientId === AUTH_SURFACES.MOBILE_INTERNAL) {
      if (isExternalAudience) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.CLIENT_NOT_ALLOWED,
          message:
            'Akses dibatasi. Akun dengan audiens eksternal tidak diizinkan masuk ke aplikasi internal klinik.',
        });
      }
    }

    await this.db
      .update(users)
      .set({
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));

    const tokenExpiresIn =
      this.configService.get('auth.expires', { infer: true }) || '1d';

    const token = await this.jwtService.signAsync(
      {
        id: user.id,
        email: user.email,
        roleCode,
        systemRole: roleCode,
        role: primaryRole
          ? {
              id: primaryRole.id,
              code: primaryRole.code,
              name: primaryRole.name,
            }
          : null,
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
        role: primaryRole
          ? {
              id: primaryRole.id,
              code: primaryRole.code,
              name: primaryRole.name,
            }
          : null,
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
      user: AuthUserMapper.formatUser(user, false),
    };
  }

  async validateGoogleLogin(
    dto: AuthGoogleLoginDto,
  ): Promise<LoginResponseDto> {
    const verifiedGoogle = await this.googleVerifier.verify(dto.idToken);
    const email = verifiedGoogle.email.toLowerCase().trim();

    // 1. Surface Gate for Mobile Internal (Strict Default-Deny):
    if (dto.clientId === AUTH_SURFACES.MOBILE_INTERNAL) {
      const existingUser = await this.db.query.users.findFirst({
        where: eq(users.email, email),
        with: {
          userRoles_userId: {
            with: {
              role: true,
            },
          },
          staffProfiles: true,
        },
      });

      const firstUserRole = existingUser?.userRoles_userId?.[0];
      const isExistingStaff =
        firstUserRole?.role?.audience === ROLE_AUDIENCE.INTERNAL ||
        Boolean(
          existingUser?.staffProfiles &&
            existingUser.staffProfiles.length > 0,
        );

      const pendingInvitation = await this.db.query.staffInvitations.findFirst({
        where: and(
          eq(staffInvitations.email, email),
          eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
        ),
      });

      // Default-Deny: If not active staff AND not in pending invitations -> 403 NOT_AUTHORIZED with ZERO DB writes
      if (!isExistingStaff && !pendingInvitation) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.NOT_AUTHORIZED,
          message:
            'Akun Google ini belum terdaftar atau belum diundang sebagai staf klinik.',
        });
      }

      if (existingUser && existingUser.status === USER_STATUS.INACTIVE) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
          message: 'Akun telah dinonaktifkan atau undangan telah dibatalkan.',
        });
      }
    }

    // 2. Lookup existing user record
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, email),
      with: {
        authAccounts: true,
        userRoles_userId: {
          with: {
            role: true,
          },
        },
        staffProfiles: true,
      },
    });

    const pendingInvitation = await this.db.query.staffInvitations.findFirst({
      where: and(
        eq(staffInvitations.email, email),
        eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
      ),
    });

    let userId: string;

    if (!userRecord) {
      const displayName = verifiedGoogle.name || email.split('@')[0];
      const [newUser] = await this.db
        .insert(users)
        .values({
          name: displayName,
          email,
          emailVerified: true,
          avatarUrl: verifiedGoogle.picture || null,
          status: 'active',
          preferredLocale: 'id-ID',
        })
        .returning();

      userId = newUser.id;

      await this.db.insert(authAccounts).values({
        userId,
        providerId: 'google',
        accountId: verifiedGoogle.sub,
      });

      const targetRole = pendingInvitation?.roleId
        ? await this.db.query.roles.findFirst({
            where: eq(roles.id, pendingInvitation.roleId),
          })
        : await this.db.query.roles.findFirst({
            where: eq(roles.audience, ROLE_AUDIENCE.EXTERNAL),
          });

      if (targetRole) {
        await this.db.insert(userRoles).values({
          userId,
          roleId: targetRole.id,
        });
      }
    } else {
      userId = userRecord.id;

      const hasGoogleAccount = userRecord.authAccounts?.some(
        (acc) => acc.providerId === 'google',
      );
      if (!hasGoogleAccount) {
        await this.db.insert(authAccounts).values({
          userId,
          providerId: 'google',
          accountId: verifiedGoogle.sub,
        });
      }

      if (verifiedGoogle.picture && !userRecord.avatarUrl) {
        await this.db
          .update(users)
          .set({
            avatarUrl: verifiedGoogle.picture,
            emailVerified: true,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(users.id, userId));
      }
    }

    await this.db
      .update(users)
      .set({
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    const completeUser = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
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
            addresses: true,
            clinicUnit: true,
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

    if (!completeUser) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.NOT_AUTHORIZED,
        message: 'Pengguna tidak ditemukan di sistem.',
      });
    }

    const primaryRole = completeUser.userRoles_userId?.[0]?.role;
    const roleCode = primaryRole?.code ?? null;

    const tokenExpiresIn =
      this.configService.get('auth.expires', { infer: true }) || '1d';
    const token = await this.jwtService.signAsync(
      {
        id: completeUser.id,
        email: completeUser.email,
        roleCode,
        role: primaryRole
          ? {
              id: primaryRole.id,
              code: primaryRole.code,
              name: primaryRole.name,
            }
          : null,
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
        sessionId: completeUser.id,
        hash: 'session_hash',
        id: completeUser.id,
        role: primaryRole
          ? {
              id: primaryRole.id,
              code: primaryRole.code,
              name: primaryRole.name,
            }
          : null,
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
      user: AuthUserMapper.formatUser(completeUser, Boolean(pendingInvitation)),
    };
  }

  async refreshToken(data: {
    sessionId: string | number;
    hash?: string;
  }): Promise<RefreshResponseDto> {
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
            addresses: true,
            clinicUnit: true,
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
    const roleCode = primaryRole?.code ?? null;

    const tokenExpiresIn =
      this.configService.get('auth.expires', { infer: true }) || '1d';
    const token = await this.jwtService.signAsync(
      {
        id: user.id,
        email: user.email,
        roleCode,
        role: primaryRole
          ? {
              id: primaryRole.id,
              code: primaryRole.code,
              name: primaryRole.name,
            }
          : null,
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
        role: primaryRole
          ? {
              id: primaryRole.id,
              code: primaryRole.code,
              name: primaryRole.name,
            }
          : null,
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

  async logout(data: {
    sessionId?: string;
    userId?: string;
    token?: string;
  }): Promise<void> {
    if (data.token) {
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

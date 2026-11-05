import {
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import {
  AUTH_ERROR_CODES,
  AUTH_PROVIDER,
  AUTH_SURFACES,
  ROLE_AUDIENCE,
  USER_STATUS,
} from '../../../common/constants';
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
import { SocketIoRealtimeGateway } from '../../../modules/notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { REALTIME_ROOMS } from '../../../modules/notifications/notifications.constants';
import { STAFF_INVITATION_STATUS } from '../../../modules/staffs/domain/constants/staff-invitation.constants';
import { AuthEmailLoginDto } from '../../dto/auth-email-login.dto';
import { AuthGoogleLoginDto } from '../../dto/auth-google-login.dto';
import { LoginResponseDto } from '../../dto/login-response.dto';
import { RefreshResponseDto } from '../../dto/refresh-response.dto';
import { GoogleTokenVerifierService } from '../../services/google-token-verifier.service';
import { AuthUserMapper } from '../mappers/auth-user.mapper';
import { UserProvisionedNotificationPublisher } from '../publishers/user-provisioned-notification.publisher';
import { IdentityEnrollmentService } from './identity-enrollment.service';
import { NikSecurityService } from '../../../common/security/nik';

@Injectable()
export class AuthLoginService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly redisService: RedisService,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly googleVerifier: GoogleTokenVerifierService,
    private readonly identityEnrollmentService: IdentityEnrollmentService,
    private readonly nikSecurity: NikSecurityService,
    @Optional()
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    private readonly userProvisionedNotificationPublisher?: UserProvisionedNotificationPublisher,
  ) {}

  async validateLogin(loginDto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.email, loginDto.email),
      with: {
        authAccounts: true,
        userRoles_userId: {
          with: {
            role: {
              with: {
                rolePermissions: {
                  with: {
                    permission: true,
                  },
                },
              },
            },
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

    let primaryRole =
      user.userRoles_userId?.find((ur) => ur.role?.isActive)?.role ?? null;
    if (!primaryRole?.isActive) {
      const isStaff =
        (user.staffProfiles && user.staffProfiles.length > 0) ||
        loginDto.clientId === AUTH_SURFACES.MOBILE_INTERNAL;

      if (!isStaff) {
        try {
          const targetRole =
            await this.identityEnrollmentService.resolveExternalRegistrationRole();
          await this.db
            .insert(userRoles)
            .values({
              userId: user.id,
              roleId: targetRole.id,
            })
            .onConflictDoNothing();
          void this.realtimeGateway?.emitToRoom?.(
            REALTIME_ROOMS.clinic,
            'roles:updated',
            { roleId: targetRole.id, action: 'user_enrolled' },
          );
          primaryRole = targetRole as any;
        } catch {
          throw new ForbiddenException({
            code: 'AUTH_USER_HAS_NO_ROLE',
            message:
              'Akun Anda belum memiliki peran aktif di sistem klinik. Hubungi administrator klinik.',
          });
        }
      } else {
        throw new ForbiddenException({
          code: 'AUTH_USER_HAS_NO_ROLE',
          message:
            'Akun Anda belum memiliki peran aktif di sistem klinik. Hubungi administrator klinik.',
        });
      }
    }

    if (!primaryRole) {
      throw new ForbiddenException({
        code: 'AUTH_USER_HAS_NO_ROLE',
        message:
          'Akun Anda belum memiliki peran aktif di sistem klinik. Hubungi administrator klinik.',
      });
    }

    const roleCode = primaryRole.code ?? null;
    const isExternalAudience = primaryRole.audience === ROLE_AUDIENCE.EXTERNAL;

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
        authVersion: user.authVersion,
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

    const pendingInvitation = await this.db.query.staffInvitations.findFirst({
      where: and(
        eq(staffInvitations.email, loginDto.email.toLowerCase().trim()),
        eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
      ),
    });

    return {
      token,
      refreshToken,
      tokenExpires: Date.now() + 86400000,
      user: AuthUserMapper.formatUser(
        user,
        Boolean(pendingInvitation),
        [],
        this.nikSecurity,
      ),
    };
  }

  async validateGoogleLogin(
    dto: AuthGoogleLoginDto,
  ): Promise<LoginResponseDto> {
    const verifiedGoogle = await this.googleVerifier.verify(dto.idToken);
    const email = verifiedGoogle.email.toLowerCase().trim();

    // 1. Lookup existing user record (by linked Google sub first, then by email)
    const linkedAuthAccount = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.providerId, AUTH_PROVIDER.GOOGLE),
        eq(authAccounts.accountId, verifiedGoogle.sub),
      ),
    });

    const userRecord = linkedAuthAccount
      ? await this.db.query.users.findFirst({
          where: eq(users.id, linkedAuthAccount.userId),
          with: {
            authAccounts: true,
            userRoles_userId: {
              with: {
                role: true,
              },
            },
            staffProfiles: true,
          },
        })
      : await this.db.query.users.findFirst({
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

    // 2. Surface Gate for Mobile Internal (Strict Default-Deny):
    if (dto.clientId === AUTH_SURFACES.MOBILE_INTERNAL) {
      const firstUserRole = userRecord?.userRoles_userId?.[0];
      const isExistingStaff =
        firstUserRole?.role?.audience === ROLE_AUDIENCE.INTERNAL ||
        Boolean(
          userRecord?.staffProfiles && userRecord.staffProfiles.length > 0,
        );

      // Default-Deny: If not active staff AND not in pending invitations -> 403 NOT_AUTHORIZED with ZERO DB writes
      if (!isExistingStaff && !pendingInvitation) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.NOT_AUTHORIZED,
          message:
            'Akun Google ini belum terdaftar atau belum diundang sebagai staf klinik.',
        });
      }

      if (userRecord && userRecord.status === USER_STATUS.INACTIVE) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
          message: 'Akun telah dinonaktifkan atau undangan telah dibatalkan.',
        });
      }
    }

    let userId: string;

    if (!userRecord) {
      let targetRole: any = null;
      if (pendingInvitation?.roleId) {
        targetRole = await this.db.query.roles.findFirst({
          where: and(
            eq(roles.id, pendingInvitation.roleId),
            eq(roles.isActive, true),
          ),
        });
        if (!targetRole) {
          throw new ForbiddenException({
            code: 'INVITATION_ROLE_INACTIVE',
            message:
              'Peran yang ditugaskan dalam undangan ini sudah tidak aktif atau telah dihapus.',
          });
        }
      } else {
        targetRole =
          await this.identityEnrollmentService.resolveExternalRegistrationRole();
      }

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

      await this.db.insert(userRoles).values({
        userId,
        roleId: targetRole.id,
      });

      if (this.userProvisionedNotificationPublisher) {
        void this.userProvisionedNotificationPublisher.publishUserProvisioned({
          userId,
          name: displayName,
          email,
          roleId: targetRole.id,
          roleName: targetRole.name,
          roleCode: targetRole.code,
          audience: targetRole.audience,
          avatarUrl: verifiedGoogle.picture || null,
        });
      } else {
        void this.realtimeGateway?.emitToRoom?.(
          REALTIME_ROOMS.clinic,
          'roles:updated',
          { roleId: targetRole.id, action: 'user_registered' },
        );
      }
    } else {
      userId = userRecord.id;

      let existingRole =
        userRecord.userRoles_userId?.find((ur) => ur.role?.isActive)?.role ??
        null;
      if (!existingRole?.isActive) {
        const isStaff =
          (userRecord.staffProfiles && userRecord.staffProfiles.length > 0) ||
          dto.clientId === AUTH_SURFACES.MOBILE_INTERNAL;

        if (!isStaff) {
          try {
            const targetRole =
              await this.identityEnrollmentService.resolveExternalRegistrationRole();
            await this.db
              .insert(userRoles)
              .values({
                userId,
                roleId: targetRole.id,
              })
              .onConflictDoNothing();
            void this.realtimeGateway?.emitToRoom?.(
              REALTIME_ROOMS.clinic,
              'roles:updated',
              { roleId: targetRole.id, action: 'user_enrolled' },
            );
            existingRole = targetRole as any;
          } catch {
            throw new ForbiddenException({
              code: 'AUTH_USER_HAS_NO_ROLE',
              message:
                'Akun Anda belum memiliki peran aktif di sistem klinik. Hubungi administrator klinik.',
            });
          }
        } else {
          throw new ForbiddenException({
            code: 'AUTH_USER_HAS_NO_ROLE',
            message:
              'Akun Anda belum memiliki peran aktif di sistem klinik. Hubungi administrator klinik.',
          });
        }
      }

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

      const userUpdates: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      if (verifiedGoogle.name && verifiedGoogle.name.trim() !== '') {
        userUpdates.name = verifiedGoogle.name.trim();
      }

      if (verifiedGoogle.picture) {
        userUpdates.avatarUrl = verifiedGoogle.picture;
        userUpdates.emailVerified = true;
      }

      await this.db.update(users).set(userUpdates).where(eq(users.id, userId));
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
            role: {
              with: {
                rolePermissions: {
                  with: {
                    permission: true,
                  },
                },
              },
            },
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
        authVersion: completeUser.authVersion,
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
      user: AuthUserMapper.formatUser(
        completeUser,
        Boolean(pendingInvitation),
        [],
        this.nikSecurity,
      ),
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
            role: {
              with: {
                rolePermissions: {
                  with: {
                    permission: true,
                  },
                },
              },
            },
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
        authVersion: user.authVersion,
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

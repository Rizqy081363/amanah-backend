import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AUTH_PROVIDER } from '../../../common/constants/auth-providers.constants';
import { USER_STATUS } from '../../../common/constants/user-status.constants';
import { RedisService } from '../../../common/redis/redis.service';
import { AllConfigType } from '../../../config/config.type';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  authSessions,
  session,
  staffProfiles,
  user,
  users,
} from '../../../database/schema';
import { MailService } from '../../../mail/mail.service';
import { AccessControlService } from '../../../modules/access-control/application/services/access-control.service';
import { AuthUpdateDto } from '../../dto/auth-update.dto';
import { AuthUserResponseDto } from '../../dto/auth-user-response.dto';
import { ChangeEmailGoogleDto } from '../../dto/change-email-google.dto';
import { ChangePasswordDto } from '../../dto/change-password.dto';
import { DeleteAccountResponseDto } from '../../dto/delete-account-response.dto';
import { LinkGoogleDto } from '../../dto/link-google.dto';
import { LinkedProvidersResponseDto } from '../../dto/linked-providers-response.dto';
import { GoogleTokenVerifierService } from '../../services/google-token-verifier.service';
import type { JwtPayloadType } from '../../strategies/types/jwt-payload.type';
import { AuthUserMapper } from '../mappers/auth-user.mapper';

@Injectable()
export class AuthAccountLifecycleService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly googleVerifier: GoogleTokenVerifierService,
    private readonly accessControlService: AccessControlService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async me(userJwtPayload: JwtPayloadType): Promise<AuthUserResponseDto | null> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userJwtPayload.id),
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
        patientProfiles: {
          with: {
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
      },
    });

    if (!userRecord) return null;

    const accessibleRoutes =
      await this.accessControlService.getUserEffectiveRoutes(userRecord.id);

    return AuthUserMapper.formatUser(userRecord, false, accessibleRoutes);
  }

  async update(
    userJwtPayload: JwtPayloadType,
    userDto: AuthUpdateDto,
  ): Promise<AuthUserResponseDto | null> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userJwtPayload.id),
    });

    if (!userRecord) {
      throw new UnauthorizedException();
    }

    if (
      userDto.email &&
      userRecord.email &&
      userDto.email.trim().toLowerCase() !==
        userRecord.email.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        'Alamat email akun bersifat permanen dan tidak dapat diubah.',
      );
    }

    const updateFields: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (userDto.firstName !== undefined || userDto.lastName !== undefined) {
      const currentNameParts = userRecord.name
        ? userRecord.name.split(' ')
        : [];
      const first =
        userDto.firstName !== undefined
          ? userDto.firstName
          : (currentNameParts[0] ?? '');
      const last =
        userDto.lastName !== undefined
          ? userDto.lastName
          : currentNameParts.slice(1).join(' ');
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

  async softDelete(userJwtPayload: JwtPayloadType): Promise<void> {
    await this.db
      .update(users)
      .set({
        status: USER_STATUS.INACTIVE,
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

  async getLinkedProviders(
    userId: string,
  ): Promise<LinkedProvidersResponseDto> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new UnauthorizedException();
    }

    const accounts = await this.db.query.authAccounts.findMany({
      where: eq(authAccounts.userId, userId),
    });

    let betterAccounts: (typeof account.$inferSelect)[] = [];
    try {
      betterAccounts = await this.db
        .select()
        .from(account)
        .where(eq(account.userId, userId));
    } catch {
      // Complementary Better Auth table
    }

    const hasPassword =
      accounts.some(
        (a) =>
          a.providerId === AUTH_PROVIDER.CREDENTIAL && Boolean(a.passwordHash),
      ) ||
      betterAccounts.some(
        (a) => a.providerId === AUTH_PROVIDER.CREDENTIAL && Boolean(a.password),
      );

    const hasGoogle =
      accounts.some((a) => a.providerId === AUTH_PROVIDER.GOOGLE) ||
      betterAccounts.some((a) => a.providerId === AUTH_PROVIDER.GOOGLE);

    const providersSet = new Set<string>();
    for (const a of accounts) {
      providersSet.add(a.providerId);
    }
    for (const a of betterAccounts) {
      providersSet.add(a.providerId);
    }
    const linkedProviders = Array.from(providersSet);

    const googleClientId =
      this.configService.get('auth.googleClientId', { infer: true }) ||
      undefined;

    return {
      linkedProviders,
      hasPassword,
      hasGoogle,
      email: userRecord.email,
      googleClientId,
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new UnauthorizedException();
    }

    const credentialAcc = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.userId, userId),
        eq(authAccounts.providerId, AUTH_PROVIDER.CREDENTIAL),
      ),
    });

    if (credentialAcc?.passwordHash) {
      if (!dto.currentPassword) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            currentPassword: 'Kata sandi saat ini wajib diisi',
          },
        });
      }
      const isOldValid = await bcrypt.compare(
        dto.currentPassword,
        credentialAcc.passwordHash,
      );
      if (!isOldValid) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            currentPassword: 'Kata sandi saat ini tidak cocok',
          },
        });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(dto.newPassword, salt);

    if (credentialAcc) {
      await this.db
        .update(authAccounts)
        .set({
          passwordHash: newHash,
          updatedAt: sql`NOW()`,
        })
        .where(eq(authAccounts.id, credentialAcc.id));
    } else {
      await this.db.insert(authAccounts).values({
        userId,
        providerId: AUTH_PROVIDER.CREDENTIAL,
        accountId: userRecord.email,
        passwordHash: newHash,
      });
    }

    try {
      await this.db
        .update(account)
        .set({
          password: newHash,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(account.userId, userId),
            eq(account.providerId, AUTH_PROVIDER.CREDENTIAL),
          ),
        );
    } catch {
      // Complementary Better-Auth table
    }

    await this.redisService.purgeUserData(userId, userRecord.email);

    try {
      await this.mailService.send({
        to: userRecord.email,
        subject: 'Pemberitahuan Keamanan: Kata Sandi Akun Diperbarui',
        text: `Halo ${userRecord.name},\n\nKata sandi akun Anda di Amanah Healthcare baru saja berhasil diperbarui. Seluruh sesi login lain telah dinonaktifkan demi keamanan akun Anda.\n\nJika Anda tidak melakukan perubahan ini, segera hubungi tim administrator sistem.`,
      });
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      message:
        'Kata sandi berhasil diperbarui. Silakan login kembali dengan kata sandi baru.',
    };
  }

  async linkGoogleAccount(
    userId: string,
    dto: LinkGoogleDto,
  ): Promise<LinkedProvidersResponseDto> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new UnauthorizedException();
    }

    const verifiedGoogle = await this.googleVerifier.verifyOrExchangeCode(dto);
    const googleSub = verifiedGoogle.sub;

    const existingLink = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.providerId, AUTH_PROVIDER.GOOGLE),
        eq(authAccounts.accountId, googleSub),
      ),
    });

    if (existingLink && existingLink.userId !== userId) {
      throw new ConflictException(
        'Akun Google ini sudah terhubung dengan akun pengguna lain di sistem.',
      );
    }

    if (!existingLink) {
      await this.db.insert(authAccounts).values({
        userId,
        providerId: AUTH_PROVIDER.GOOGLE,
        accountId: googleSub,
      });

      try {
        await this.db.insert(account).values({
          userId,
          accountId: googleSub,
          providerId: AUTH_PROVIDER.GOOGLE,
          createdAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        });
      } catch {
        // Complementary Better-Auth table
      }
    }

    const userUpdates: Record<string, any> = {
      updatedAt: sql`NOW()`,
    };

    if (verifiedGoogle.name && verifiedGoogle.name.trim() !== '') {
      userUpdates.name = verifiedGoogle.name.trim();
    }

    if (verifiedGoogle.picture) {
      userUpdates.avatarUrl = verifiedGoogle.picture;
    }

    await this.db.update(users).set(userUpdates).where(eq(users.id, userId));

    try {
      const betterAuthUpdates: Record<string, any> = {
        updatedAt: sql`NOW()`,
      };
      if (userUpdates.name) betterAuthUpdates.name = userUpdates.name;
      if (userUpdates.avatarUrl)
        betterAuthUpdates.image = userUpdates.avatarUrl;

      await this.db
        .update(user)
        .set(betterAuthUpdates)
        .where(eq(user.id, userId));
    } catch {
      // Non-blocking complementary table sync
    }

    try {
      await this.mailService.send({
        to: userRecord.email,
        subject: 'Pemberitahuan Keamanan: Akun Google Berhasil Ditautkan',
        text: `Halo ${userRecord.name},\n\nAkun Google (${verifiedGoogle.email}) telah berhasil ditautkan ke akun Amanah Healthcare Anda. Anda kini dapat menggunakan tombol Masuk dengan Google.`,
      });
    } catch {
      // Non-blocking
    }

    return this.getLinkedProviders(userId);
  }

  async changeEmailWithGoogle(
    userId: string,
    dto: ChangeEmailGoogleDto,
  ): Promise<{ success: boolean; message: string }> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new UnauthorizedException();
    }

    const verifiedGoogle = await this.googleVerifier.verifyOrExchangeCode(dto);
    const googleSub = verifiedGoogle.sub;

    if (!verifiedGoogle.email) {
      throw new BadRequestException(
        'Akun Google tidak menyediakan klaim alamat email yang valid.',
      );
    }

    const newEmail = verifiedGoogle.email.toLowerCase().trim();

    // 1. Relational collision check for Google sub
    const existingSubLink = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.providerId, AUTH_PROVIDER.GOOGLE),
        eq(authAccounts.accountId, googleSub),
      ),
    });

    if (existingSubLink && existingSubLink.userId !== userId) {
      throw new ConflictException(
        'Akun Google ini sudah terhubung dengan akun pengguna lain di sistem.',
      );
    }

    // 2. Relational collision check for canonical user email
    const existingEmailUser = await this.db.query.users.findFirst({
      where: eq(users.email, newEmail),
    });

    if (existingEmailUser && existingEmailUser.id !== userId) {
      throw new ConflictException(
        'Alamat email Akun Google tersebut sudah terdaftar pada akun lain di sistem.',
      );
    }

    // 3. If identical to current state, return early without destructive invalidation
    if (
      userRecord.email.toLowerCase() === newEmail &&
      existingSubLink?.userId === userId
    ) {
      return {
        success: true,
        message: 'Akun Google yang dipilih sama dengan akun yang sedang aktif.',
      };
    }

    const oldEmail = userRecord.email;
    const nowIso = new Date().toISOString();

    await this.db.transaction(async (tx) => {
      // a. Update/Upsert Google authAccounts for this user
      const currentGoogleLink = await tx.query.authAccounts.findFirst({
        where: and(
          eq(authAccounts.userId, userId),
          eq(authAccounts.providerId, AUTH_PROVIDER.GOOGLE),
        ),
      });

      if (currentGoogleLink) {
        await tx
          .update(authAccounts)
          .set({
            accountId: googleSub,
            updatedAt: nowIso,
          })
          .where(eq(authAccounts.id, currentGoogleLink.id));
      } else {
        await tx.insert(authAccounts).values({
          userId,
          providerId: AUTH_PROVIDER.GOOGLE,
          accountId: googleSub,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }

      // b. Sync Better-Auth account table
      try {
        await tx
          .delete(account)
          .where(
            and(
              eq(account.userId, userId),
              eq(account.providerId, AUTH_PROVIDER.GOOGLE),
            ),
          );
        await tx.insert(account).values({
          userId,
          accountId: googleSub,
          providerId: AUTH_PROVIDER.GOOGLE,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } catch {
        // Non-blocking complementary table
      }

      // c. Update canonical users table
      const userUpdates: Record<string, any> = {
        email: newEmail,
        emailVerified: true,
        authVersion: sql`auth_version + 1`,
        updatedAt: nowIso,
      };
      if (verifiedGoogle.picture) {
        userUpdates.avatarUrl = verifiedGoogle.picture;
      }
      await tx.update(users).set(userUpdates).where(eq(users.id, userId));

      // d. Update Better-Auth user table
      try {
        await tx
          .update(user)
          .set({
            email: newEmail,
            emailVerified: true,
            updatedAt: nowIso,
          })
          .where(eq(user.id, userId));
      } catch {
        // Non-blocking
      }

      // e. Update staff_profiles table (synced by userId)
      await tx
        .update(staffProfiles)
        .set({
          email: newEmail,
          updatedAt: nowIso,
        })
        .where(eq(staffProfiles.userId, userId));

      // f. Revoke all active sessions in auth_sessions
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

      // g. Delete Better-Auth sessions
      try {
        await tx.delete(session).where(eq(session.userId, userId));
      } catch {
        // Non-blocking
      }
    });

    // 4. Purge Redis caches
    await this.redisService.purgeUserData(userId, oldEmail);
    await this.redisService.purgeUserData(userId, newEmail);

    // 5. Send security alert notification to old email
    try {
      await this.mailService.send({
        to: oldEmail,
        subject:
          'Pemberitahuan Keamanan: Alamat Email dan Akun Google Telah Dipindahkan',
        text: `Halo ${userRecord.name},\n\nAlamat email dan Akun Google untuk akun Amanah Healthcare Anda telah berhasil dialihkan ke: ${newEmail}.\n\nSeluruh sesi login sebelumnya telah dinonaktifkan demi keamanan akun Anda. Jika Anda tidak merasa melakukan tindakan ini, segera hubungi tim administrator sistem.`,
      });
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      message:
        'Alamat email akun dan Akun Google berhasil dialihkan. Seluruh sesi login sebelumnya telah dinonaktifkan demi keamanan. Silakan masuk kembali dengan Akun Google baru Anda.',
    };
  }

  async unlinkCredential(userId: string): Promise<LinkedProvidersResponseDto> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new UnauthorizedException();
    }

    const currentProviders = await this.getLinkedProviders(userId);
    if (!currentProviders.hasGoogle) {
      throw new BadRequestException(
        'Tidak dapat mematikan kata sandi karena tidak ada metode masuk lain yang aktif. Hubungkan akun Google terlebih dahulu untuk mencegah akun terkunci.',
      );
    }

    await this.db
      .delete(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, userId),
          eq(authAccounts.providerId, AUTH_PROVIDER.CREDENTIAL),
        ),
      );

    try {
      await this.db
        .delete(account)
        .where(
          and(
            eq(account.userId, userId),
            eq(account.providerId, AUTH_PROVIDER.CREDENTIAL),
          ),
        );
    } catch {
      // Complementary Better-Auth table
    }

    await this.redisService.purgeUserData(userId, userRecord.email);

    try {
      await this.mailService.send({
        to: userRecord.email,
        subject: 'Pemberitahuan Keamanan: Akses Kata Sandi Dinonaktifkan',
        text: `Halo ${userRecord.name},\n\nAkses masuk menggunakan kata sandi tradisional telah dinonaktifkan. Mulai saat ini, Anda hanya dapat masuk menggunakan Akun Google yang telah terhubung.`,
      });
    } catch {
      // Non-blocking
    }

    return this.getLinkedProviders(userId);
  }

  async unlinkGoogle(userId: string): Promise<LinkedProvidersResponseDto> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!userRecord) {
      throw new UnauthorizedException();
    }

    const currentProviders = await this.getLinkedProviders(userId);
    if (!currentProviders.hasPassword) {
      throw new BadRequestException(
        'Tidak dapat melepas akun Google karena tidak ada kata sandi yang aktif. Buat kata sandi terlebih dahulu untuk mencegah akun terkunci.',
      );
    }

    await this.db
      .delete(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, userId),
          eq(authAccounts.providerId, AUTH_PROVIDER.GOOGLE),
        ),
      );

    try {
      await this.db
        .delete(account)
        .where(
          and(
            eq(account.userId, userId),
            eq(account.providerId, AUTH_PROVIDER.GOOGLE),
          ),
        );
    } catch {
      // Complementary Better-Auth table
    }

    await this.db
      .update(users)
      .set({
        name: 'Super Admin',
        updatedAt: sql`NOW()`,
      })
      .where(eq(users.id, userId));

    try {
      await this.db
        .update(user)
        .set({
          name: 'Super Admin',
          updatedAt: sql`NOW()`,
        })
        .where(eq(user.id, userId));
    } catch {
      // Non-blocking complementary Better-Auth table sync
    }

    try {
      await this.mailService.send({
        to: userRecord.email,
        subject: 'Pemberitahuan Keamanan: Tautan Akun Google Dilepas',
        text: `Halo ${userRecord.name},\n\nTautan akun Google telah berhasil dilepas dari akun Anda. Anda kini masuk menggunakan alamat email dan kata sandi.`,
      });
    } catch {
      // Non-blocking
    }

    return this.getLinkedProviders(userId);
  }
}

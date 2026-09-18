import {
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
import { AllConfigType } from '../config/config.type';
import { DRIZZLE_SOURCE } from '../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  roles,
  user,
  userRoles,
  users,
} from '../database/schema';
import { MailService } from '../mail/mail.service';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import type { JwtPayloadType } from './strategies/types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly mailService: MailService,
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
        staffProfiles: true,
        patientProfiles: true,
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
      user: {
        id: user.id as any,
        email: user.email,
        systemRole: systemRole as any,
        role: { id: primaryRole?.id as any, name: systemRole } as any,
        staff: user.staffProfiles?.[0] as any,
        patient: user.patientProfiles?.[0] as any,
      } as any,
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
        staffProfiles: true,
        patientProfiles: true,
      },
    });
    return user || null;
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
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'emailNotExists',
        },
      });
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

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

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

    try {
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
    } catch {
      // Complementary
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
        staffProfiles: true,
        patientProfiles: true,
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

  async logout(_data: any): Promise<void> {}
}

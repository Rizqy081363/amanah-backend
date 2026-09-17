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
import { eq } from 'drizzle-orm';
import { AllConfigType } from '../config/config.type';
import { DRIZZLE_SOURCE } from '../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../database/drizzle/drizzle.provider';
import { users } from '../database/schema';
import { MailService } from '../mail/mail.service';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { LoginResponseDto } from './dto/login-response.dto';

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

  async register(_dto: any): Promise<void> {}

  async confirmEmail(_hash: string): Promise<void> {}

  async confirmNewEmail(_hash: string): Promise<void> {}

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

  async resetPassword(_hash: string, _password: string): Promise<void> {}

  async update(_userJwtPayload: any, _userDto: any): Promise<any> {
    return null;
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

  async softDelete(_userJwtPayload: any): Promise<void> {}

  async logout(_data: any): Promise<void> {}
}

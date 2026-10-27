import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { RedisService } from '../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  user,
  users,
} from '../../../database/schema';
import { USER_STATUS } from '../../constants/auth.constants';
import { AuthUpdateDto } from '../../dto/auth-update.dto';
import { DeleteAccountResponseDto } from '../../dto/delete-account-response.dto';
import type { JwtPayloadType } from '../../strategies/types/jwt-payload.type';
import { AuthUserMapper } from '../mappers/auth-user.mapper';

@Injectable()
export class AuthAccountLifecycleService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
  ) {}

  async me(userJwtPayload: any): Promise<any> {
    const userRecord = await this.db.query.users.findFirst({
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
    return userRecord ? AuthUserMapper.formatUser(userRecord, false) : null;
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
}

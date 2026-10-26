import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { auth as betterAuth } from '../../auth/better-auth/auth';
import { SYSTEM_ROLES, type SystemRole } from '../../auth/constants/auth.constants';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { users } from '../../database/schema';
import { formatBloodTypeDisplay } from '../../modules/patients/domain/data/patient-reference.data';
import { STAFF_ROLE_CODES } from '../../modules/staffs/domain/constants/staff-invitation.constants';
import { RedisService } from '../redis/redis.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class HybridAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly reflector?: Reflector,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token && this.redisService) {
        const isBlacklisted = await this.redisService.getString(
          `blacklist:token:${token}`,
        );
        if (isBlacklisted) {
          throw new UnauthorizedException(
            'Sesi autentikasi telah berakhir atau token telah dicabut',
          );
        }
      }
    }

    try {
      const jwtResult = await super.canActivate(context);
      if (jwtResult && (request as any).user) {
        return true;
      }
    } catch {}

    try {
      const session = await betterAuth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session || !session.user || !session.user.id) {
        throw new UnauthorizedException(
          'Sesi autentikasi tidak valid atau token tidak disertakan',
        );
      }

      if (session.user.banned) {
        throw new UnauthorizedException(
          session.user.banReason || 'Akun Anda dinonaktifkan',
        );
      }

      const userRecord = await this.db.query.users.findFirst({
        where: eq(users.id, session.user.id),
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
          patientProfiles: true,
        },
      });

      if (!userRecord) {
        throw new UnauthorizedException('Pengguna tidak ditemukan di database');
      }

      const primaryRole = userRecord.userRoles_userId?.[0]?.role;
      let systemRole: SystemRole = SYSTEM_ROLES.PATIENT;
      if (primaryRole?.code === 'admin') {
        systemRole = SYSTEM_ROLES.ADMIN;
      } else if (
        primaryRole?.code === STAFF_ROLE_CODES.DOCTOR ||
        primaryRole?.code === STAFF_ROLE_CODES.MIDWIFE ||
        primaryRole?.code === STAFF_ROLE_CODES.WORKER ||
        (userRecord.staffProfiles && userRecord.staffProfiles.length > 0)
      ) {
        systemRole = SYSTEM_ROLES.STAF;
      }

      const userRoleCodes = (userRecord.userRoles_userId || [])
        .map((ur) => ur.role?.code)
        .filter((code): code is string => Boolean(code));
      const roleCode =
        primaryRole?.code ||
        (systemRole === SYSTEM_ROLES.ADMIN
          ? 'admin'
          : systemRole === SYSTEM_ROLES.STAF
            ? 'staff_worker'
            : 'patient');

      const staffProfile = userRecord.staffProfiles?.[0];
      const patientProfile = userRecord.patientProfiles?.[0];

      (request as any).user = {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        systemRole,
        roleCode,
        roles: userRoleCodes.length > 0 ? userRoleCodes : [roleCode],
        role: {
          id: primaryRole?.id,
          code: primaryRole?.code,
          name: systemRole,
        },
        staff: staffProfile
          ? {
              id: staffProfile.id,
              practitionerId: staffProfile.practitioners?.[0]?.id || null,
              userId: userRecord.id,
              poliklinikId: staffProfile.primaryUnitId,
              fullName: staffProfile.fullName,
              profession: staffProfile.positionTitle,
              staffCode: staffProfile.staffCode,
              idCardNumber: staffProfile.nationalIdEncrypted || null,
              gender: staffProfile.gender || null,
              photoUrl: staffProfile.avatarUrl,
              phoneNumber: staffProfile.phone,
              isActive: staffProfile.status === 'active',
            }
          : null,
        patient: patientProfile
          ? {
              id: patientProfile.id,
              userId: userRecord.id,
              medicalRecordNumber: patientProfile.medicalRecordNumber,
              nik:
                patientProfile.nationalIdEncrypted ||
                patientProfile.nationalIdHash ||
                '',
              fullName: patientProfile.fullName,
              gender: patientProfile.gender || null,
              birthPlace: patientProfile.birthPlace,
              birthDate:
                typeof patientProfile.birthDate === 'string'
                  ? patientProfile.birthDate
                  : (patientProfile.birthDate as any)
                      ?.toISOString?.()
                      ?.slice(0, 10) || null,
              bloodType: formatBloodTypeDisplay(patientProfile.bloodType),
              phoneNumber: patientProfile.phone,
              status: patientProfile.status,
            }
          : null,
      };

      (request as any).session = session.session;
      return true;
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException(
        'Sesi autentikasi tidak valid atau token tidak disertakan',
      );
    }
  }
}

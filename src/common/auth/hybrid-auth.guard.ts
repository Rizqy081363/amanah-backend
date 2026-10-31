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
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { users } from '../../database/schema';
import { formatBloodTypeDisplay } from '../../modules/patients/domain/data/patient-reference.data';
import { DomainUnauthorizedException } from '../exceptions';
import { RedisService } from '../redis/redis.service';
import {
  type RoleAudience,
} from '../constants/role-audience.constants';
import type { AuthenticatedUser } from './authenticated-user.interface';
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
          throw new DomainUnauthorizedException(
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
        throw new DomainUnauthorizedException(
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
          patientProfiles: true,
        },
      });

      if (!userRecord) {
        throw new DomainUnauthorizedException(
          'Pengguna tidak ditemukan di database',
        );
      }

      const staffProfile = userRecord.staffProfiles?.[0];
      const patientProfile = userRecord.patientProfiles?.[0];
      const primaryRole =
        userRecord.userRoles_userId?.[0]?.role ?? staffProfile?.role ?? null;

      const audience: RoleAudience | null =
        (primaryRole?.audience as RoleAudience) ?? null;

      const userRoleCodes = (userRecord.userRoles_userId || [])
        .map((ur) => ur.role?.code)
        .filter((code): code is string => Boolean(code));
      const roleCode = primaryRole?.code ?? null;
      const systemRole = roleCode;

      const permissionSet = new Set<string>();
      for (const ur of userRecord.userRoles_userId || []) {
        for (const rp of ur.role?.rolePermissions || []) {
          if (rp.permission?.code) permissionSet.add(rp.permission.code);
        }
      }
      if (staffProfile?.role) {
        for (const rp of staffProfile.role.rolePermissions || []) {
          if (rp.permission?.code) permissionSet.add(rp.permission.code);
        }
      }

      const isClinical =
        staffProfile?.role?.isClinical ??
        Boolean(staffProfile?.practitioners?.length);

      const authenticatedUser: AuthenticatedUser = {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        systemRole,
        roleCode,
        roles: userRoleCodes.length > 0 ? userRoleCodes : roleCode ? [roleCode] : [],
        audience,
        role: primaryRole
          ? {
              id: primaryRole.id,
              code: primaryRole.code,
              name: primaryRole.name,
              tier: primaryRole.tier,
              audience: primaryRole.audience,
              isClinical: primaryRole.isClinical,
              isSystem: primaryRole.isSystem,
            }
          : null,
        permissions: Array.from(permissionSet),
        staff: staffProfile
          ? {
              id: staffProfile.id,
              roleId: staffProfile.roleId || staffProfile.role?.id || null,
              roleCode: staffProfile.role?.code || null,
              roleName: staffProfile.role?.name || null,
              isClinical,
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

      (request as any).user = authenticatedUser;
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

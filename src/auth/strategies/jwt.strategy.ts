import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AllConfigType } from '../../config/config.type';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { users } from '../../database/schema';
import {
  type RoleAudience,
} from '../../common/constants/role-audience.constants';
import { JwtPayloadType } from './types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AllConfigType>,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow('auth.secret', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  public async validate(payload: JwtPayloadType) {
    if (!payload.id) {
      throw new UnauthorizedException();
    }

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, payload.id),
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

    if (!user) {
      throw new UnauthorizedException();
    }

    const staffProfile = user.staffProfiles?.[0];
    const patientProfile = user.patientProfiles?.[0];

    const primaryRole =
      user.userRoles_userId?.[0]?.role ?? staffProfile?.role ?? null;
    const userRoleCodes = (user.userRoles_userId || [])
      .map((ur) => ur.role?.code)
      .filter((code): code is string => Boolean(code));
    const roleCode = primaryRole?.code ?? null;
    const systemRole = roleCode;

    const permissionSet = new Set<string>();
    for (const ur of user.userRoles_userId || []) {
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

    const audience: RoleAudience | null =
      (primaryRole?.audience as RoleAudience) ?? null;

    return {
      ...payload,
      id: user.id,
      email: user.email,
      name: user.name,
      systemRole,
      roleCode,
      roles: userRoleCodes.length > 0 ? userRoleCodes : roleCode ? [roleCode] : [],
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
      audience,
      permissions: Array.from(permissionSet),
      staff: staffProfile
        ? {
            id: staffProfile.id,
            roleId: staffProfile.roleId || staffProfile.role?.id || null,
            roleCode: staffProfile.role?.code || null,
            roleName: staffProfile.role?.name || null,
            isClinical,
            practitionerId: staffProfile.practitioners?.[0]?.id || null,
            userId: user.id,
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
            userId: user.id,
            medicalRecordNumber: patientProfile.medicalRecordNumber,
            nik: patientProfile.nationalIdEncrypted || null,
            fullName: patientProfile.fullName,
            gender: patientProfile.gender || null,
            birthPlace: patientProfile.birthPlace,
            birthDate: patientProfile.birthDate,
            bloodType: patientProfile.bloodType,
            phoneNumber: patientProfile.phone,
            status: patientProfile.status,
          }
        : null,
    };
  }
}

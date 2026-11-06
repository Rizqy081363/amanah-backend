import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AllConfigType } from '../../config/config.type';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { users } from '../../database/schema';
import { type RoleAudience, isAccountBlocked } from '../../common/constants';
import { JwtPayloadType } from './types/jwt-payload.type';
import { NikSecurityService } from '../../common/security/nik';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AllConfigType>,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly nikSecurity: NikSecurityService,
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
        patientProfiles: {
          with: {
            bloodType: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    if (isAccountBlocked(user.status)) {
      throw new UnauthorizedException(
        'Sesi tidak valid: Akun Anda telah dinonaktifkan atau ditangguhkan.',
      );
    }

    const staffProfile = user.staffProfiles?.[0];
    const patientProfile = user.patientProfiles?.[0];

    const activeUserRoles = (user.userRoles_userId || []).filter(
      (ur) => ur.role?.isActive,
    );
    const primaryRole =
      activeUserRoles[0]?.role ??
      (staffProfile?.role?.isActive ? staffProfile.role : null);

    if (!primaryRole) {
      throw new UnauthorizedException(
        'Sesi tidak valid: Akun Anda tidak memiliki peran aktif di sistem.',
      );
    }

    if (
      payload.authVersion &&
      user.authVersion &&
      payload.authVersion !== user.authVersion
    ) {
      throw new UnauthorizedException(
        'Sesi telah kedaluwarsa karena pembaruan hak akses. Silakan masuk kembali.',
      );
    }

    const userRoleCodes = activeUserRoles
      .map((ur) => ur.role?.code)
      .filter((code): code is string => Boolean(code));
    const roleCode = primaryRole?.code ?? null;
    const systemRole = roleCode;

    const permissionSet = new Set<string>();
    for (const ur of activeUserRoles) {
      for (const rp of ur.role?.rolePermissions || []) {
        if (rp.permission?.code) permissionSet.add(rp.permission.code);
      }
    }
    if (staffProfile?.role?.isActive) {
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
      phone: user.phone || null,
      systemRole,
      roleCode,
      roles:
        userRoleCodes.length > 0 ? userRoleCodes : roleCode ? [roleCode] : [],
      role: primaryRole
        ? {
            id: primaryRole.id,
            code: primaryRole.code,
            name: primaryRole.name,
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
            idCardNumber:
              (staffProfile.nationalIdEncrypted
                ? this.nikSecurity.decrypt(staffProfile.nationalIdEncrypted)
                : null) || null,
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
            nik:
              (patientProfile.nationalIdEncrypted
                ? this.nikSecurity.decrypt(patientProfile.nationalIdEncrypted)
                : null) || null,
            maskedNik:
              this.nikSecurity.mask(patientProfile.nationalIdEncrypted) || null,
            fullName: patientProfile.fullName,
            gender: patientProfile.gender || null,
            birthPlace: patientProfile.birthPlace,
            birthDate: patientProfile.birthDate,
            bloodType: (patientProfile as any).bloodType?.name || null,
            bloodTypeId: patientProfile.bloodTypeId,
            phoneNumber: patientProfile.phone,
            status: patientProfile.status,
          }
        : null,
    };
  }
}

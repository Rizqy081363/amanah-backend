import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AllConfigType } from '../../config/config.type';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { users } from '../../database/schema';
import { STAFF_ROLE_CODES } from '../../modules/staffs/domain/constants/staff-invitation.constants';
import { SYSTEM_ROLES, type SystemRole } from '../constants/auth.constants';
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

    if (!user) {
      throw new UnauthorizedException();
    }

    const primaryRole = user.userRoles_userId?.[0]?.role;
    let systemRole: SystemRole = SYSTEM_ROLES.PATIENT;
    if (primaryRole?.code === 'admin') {
      systemRole = SYSTEM_ROLES.ADMIN;
    } else if (
      primaryRole?.code === STAFF_ROLE_CODES.DOCTOR ||
      primaryRole?.code === STAFF_ROLE_CODES.MIDWIFE ||
      primaryRole?.code === STAFF_ROLE_CODES.WORKER ||
      (user.staffProfiles && user.staffProfiles.length > 0)
    ) {
      systemRole = SYSTEM_ROLES.STAF;
    }

    const userRoleCodes = (user.userRoles_userId || [])
      .map((ur) => ur.role?.code)
      .filter((code): code is string => Boolean(code));
    const roleCode =
      primaryRole?.code ||
      (systemRole === SYSTEM_ROLES.ADMIN
        ? 'admin'
        : systemRole === SYSTEM_ROLES.STAF
          ? 'staff_worker'
          : 'patient');

    const staffProfile = user.staffProfiles?.[0];
    const patientProfile = user.patientProfiles?.[0];

    return {
      ...payload,
      id: user.id,
      email: user.email,
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
            userId: user.id,
            poliklinikId: staffProfile.primaryUnitId,
            fullName: staffProfile.fullName,
            profession: staffProfile.positionTitle,
            staffCode: staffProfile.staffCode,
            idCardNumber: staffProfile.nationalIdEncrypted || null,
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
              patientProfile.nationalIdEncrypted ||
              patientProfile.nationalIdHash ||
              '',
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

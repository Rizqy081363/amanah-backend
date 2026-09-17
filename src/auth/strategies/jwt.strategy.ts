import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AllConfigType } from '../../config/config.type';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { users } from '../../database/schema';
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

    const staffProfile = user.staffProfiles?.[0];
    const patientProfile = user.patientProfiles?.[0];

    return {
      ...payload,
      id: user.id,
      email: user.email,
      systemRole,
      role: {
        id: primaryRole?.id,
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
            idCardNumber: staffProfile.staffCode,
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
            gender:
              patientProfile.gender === 'female' ? 'Perempuan' : 'Laki-laki',
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

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { auth as betterAuth } from '../../auth/better-auth/auth';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import { users } from '../../database/schema';

@Injectable()
export class HybridAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. First attempt: Passport JWT validation (Canonical JWT from email/password login)
    try {
      const jwtResult = await super.canActivate(context);
      if (jwtResult && (request as any).user) {
        return true;
      }
    } catch {
      // Passport JWT failed or token was not a valid JWT HS256.
      // Fall through to evaluate Better Auth session (Google OAuth / Social Auth).
    }

    // 2. Fallback: Better Auth Session validation (supports both Cookie and Bearer session token)
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
      let systemRole: 'ADMIN' | 'STAF' | 'PATIENT' = 'PATIENT';
      if (primaryRole?.code === 'admin') {
        systemRole = 'ADMIN';
      } else if (
        primaryRole?.code === 'staff_doctor' ||
        primaryRole?.code === 'staff_midwife' ||
        primaryRole?.code === 'staff_worker' ||
        (userRecord.staffProfiles && userRecord.staffProfiles.length > 0)
      ) {
        systemRole = 'STAF';
      }

      const staffProfile = userRecord.staffProfiles?.[0];
      const patientProfile = userRecord.patientProfiles?.[0];

      (request as any).user = {
        id: userRecord.id,
        email: userRecord.email,
        systemRole,
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
              idCardNumber: staffProfile.staffCode,
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
              gender:
                patientProfile.gender === 'female' ? 'Perempuan' : 'Laki-laki',
              birthPlace: patientProfile.birthPlace,
              birthDate:
                typeof patientProfile.birthDate === 'string'
                  ? patientProfile.birthDate
                  : (patientProfile.birthDate as any)?.toISOString?.()?.slice(0, 10) || null,
              bloodType:
                patientProfile.bloodType === 'unknown'
                  ? 'Belum Tahu'
                  : (patientProfile.bloodType?.toUpperCase() ?? patientProfile.bloodType ?? null),
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

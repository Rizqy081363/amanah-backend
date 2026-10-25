import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { isUUID } from 'class-validator';
import { and, eq, or, sql } from 'drizzle-orm';
import { RedisService } from '../common/redis/redis.service';
import { NameInitialsHelper } from '../common/utils/name-initials.helper';
import { AllConfigType } from '../config/config.type';
import { DRIZZLE_SOURCE } from '../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  clinicUnits,
  doctorAssignments,
  medicalSpecialties,
  practitioners,
  roles,
  session,
  sessionDefs,
  staffAddresses,
  staffInvitations,
  staffProfiles,
  user,
  userRoles,
  users,
} from '../database/schema';
import { MailService } from '../mail/mail.service';
import {
  BETTER_AUTH_STAFF_ROLES,
  type BetterAuthStaffRole,
  STAFF_INVITATION_STATUS,
  STAFF_ROLE_CODES,
  STAFF_STATUS,
  STAFF_TYPES,
  type StaffRoleCode,
  type StaffType,
} from '../modules/staffs/domain/constants/staff-invitation.constants';
import { MEDICAL_SPECIALTY_CODES } from '../modules/clinics/domain/constants/medical-specialty.constants';
import { formatBloodTypeDisplay } from '../modules/patients/domain/data/patient-reference.data';
import { auth } from './better-auth/auth';
import {
  AUTH_ERROR_CODES,
  AUTH_SURFACES,
  SYSTEM_ROLES,
  type SystemRole,
  USER_STATUS,
} from './constants/auth.constants';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import {
  AuthResendOtpDto,
  ResendOtpResponseDto,
} from './dto/auth-resend-otp.dto';
import { AuthResetPasswordOtpDto } from './dto/auth-reset-password-otp.dto';
import {
  AuthStaffOnboardingDto,
  StaffOnboardingRole,
} from './dto/auth-staff-onboarding.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthVerifyOtpDto } from './dto/auth-verify-otp.dto';
import { DeleteAccountResponseDto } from './dto/delete-account-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { GoogleTokenVerifierService } from './services/google-token-verifier.service';
import type { JwtPayloadType } from './strategies/types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly googleVerifier: GoogleTokenVerifierService,
  ) {}

  private async resolveOnboardingPoliklinikId(
    poliklinikId?: string,
  ): Promise<string | undefined> {
    const value = poliklinikId?.trim();
    if (!value) {
      return undefined;
    }

    let clinicUnit: any;
    if (isUUID(value)) {
      clinicUnit = await this.db.query.clinicUnits.findFirst({
        where: eq(clinicUnits.id, value),
      });
    }

    if (!clinicUnit) {
      const normalizedCode = value.toLowerCase().replace(/-/g, '_');
      clinicUnit = await this.db.query.clinicUnits.findFirst({
        where: or(
          eq(clinicUnits.code, value),
          eq(clinicUnits.code, normalizedCode),
          eq(sql`lower(${clinicUnits.name})`, value.toLowerCase()),
        ),
      });
    }

    if (!clinicUnit?.isActive) {
      throw new BadRequestException(
        'Poliklinik tidak valid. Pilih Poli Umum atau Poli KIA.',
      );
    }

    return clinicUnit.id;
  }

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

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'notFound',
        },
      });
    }

    if (user.status === USER_STATUS.INACTIVE) {
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
        message: 'Akun telah dinonaktifkan atau undangan telah dibatalkan.',
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

    if (loginDto.clientId === AUTH_SURFACES.MOBILE_INTERNAL) {
      if (systemRole === SYSTEM_ROLES.PATIENT) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.CLIENT_NOT_ALLOWED,
          message:
            'Akun pasien tidak memiliki izin akses ke aplikasi internal staf/dokter.',
        });
      }
    }

    await this.db
      .update(users)
      .set({
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));

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
      user: (await this.formatUser(user)) as any,
    };
  }

  async validateGoogleLogin(
    dto: AuthGoogleLoginDto,
  ): Promise<LoginResponseDto> {
    const verifiedGoogle = await this.googleVerifier.verify(dto.idToken);
    const email = verifiedGoogle.email.toLowerCase().trim();

    // 1. Surface Gate for Mobile Internal (Strict Default-Deny):
    if (dto.clientId === AUTH_SURFACES.MOBILE_INTERNAL) {
      const existingUser = await this.db.query.users.findFirst({
        where: eq(users.email, email),
        with: {
          userRoles_userId: {
            with: {
              role: true,
            },
          },
          staffProfiles: true,
        },
      });

      const primaryRoleCode = existingUser?.userRoles_userId?.[0]?.role?.code;
      const isExistingStaff =
        primaryRoleCode === STAFF_ROLE_CODES.DOCTOR ||
        primaryRoleCode === STAFF_ROLE_CODES.MIDWIFE ||
        primaryRoleCode === STAFF_ROLE_CODES.WORKER ||
        Boolean(
          existingUser?.staffProfiles && existingUser.staffProfiles.length > 0,
        );

      const pendingInvitation = await this.db.query.staffInvitations.findFirst({
        where: and(
          eq(staffInvitations.email, email),
          eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
        ),
      });

      // Default-Deny: If not active staff AND not in pending invitations -> 403 NOT_AUTHORIZED with ZERO DB writes
      if (!isExistingStaff && !pendingInvitation) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.NOT_AUTHORIZED,
          message:
            'Akun Google ini belum terdaftar atau belum diundang sebagai staf/dokter klinik.',
        });
      }

      if (existingUser && existingUser.status === USER_STATUS.INACTIVE) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
          message: 'Akun telah dinonaktifkan atau undangan telah dibatalkan.',
        });
      }
    }

    // 2. Lookup existing user record
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, email),
      with: {
        authAccounts: true,
        userRoles_userId: {
          with: {
            role: true,
          },
        },
        staffProfiles: true,
      },
    });

    const pendingInvitation = await this.db.query.staffInvitations.findFirst({
      where: and(
        eq(staffInvitations.email, email),
        eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
      ),
    });

    let userId: string;

    if (!userRecord) {
      // Must be an invited user since uninvited was rejected above
      const displayName = verifiedGoogle.name || email.split('@')[0];
      const [newUser] = await this.db
        .insert(users)
        .values({
          name: displayName,
          email,
          emailVerified: true,
          avatarUrl: verifiedGoogle.picture || null,
          status: 'active',
          preferredLocale: 'id-ID',
        })
        .returning();

      userId = newUser.id;

      // Create google auth account
      await this.db.insert(authAccounts).values({
        userId,
        providerId: 'google',
        accountId: verifiedGoogle.sub,
      });

      // Assign role based on invitation
      const roleCode = pendingInvitation?.roleCode || STAFF_ROLE_CODES.WORKER;
      const targetRole = await this.db.query.roles.findFirst({
        where: eq(roles.code, roleCode),
      });
      if (targetRole) {
        await this.db.insert(userRoles).values({
          userId,
          roleId: targetRole.id,
        });
      }
    } else {
      userId = userRecord.id;

      // Link Google authAccount if not already linked
      const hasGoogleAccount = userRecord.authAccounts?.some(
        (acc) => acc.providerId === 'google',
      );
      if (!hasGoogleAccount) {
        await this.db.insert(authAccounts).values({
          userId,
          providerId: 'google',
          accountId: verifiedGoogle.sub,
        });
      }

      if (verifiedGoogle.picture && !userRecord.avatarUrl) {
        await this.db
          .update(users)
          .set({
            avatarUrl: verifiedGoogle.picture,
            emailVerified: true,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(users.id, userId));
      }
    }

    await this.db
      .update(users)
      .set({
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    // Re-fetch complete user record for token signing and formatting
    const completeUser = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        authAccounts: true,
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

    if (!completeUser) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.NOT_AUTHORIZED,
        message: 'Pengguna tidak ditemukan di sistem.',
      });
    }

    const primaryRole = completeUser.userRoles_userId?.[0]?.role;
    let systemRole: SystemRole = SYSTEM_ROLES.PATIENT;
    if (primaryRole?.code === 'admin') {
      systemRole = SYSTEM_ROLES.ADMIN;
    } else if (
      primaryRole?.code === STAFF_ROLE_CODES.DOCTOR ||
      primaryRole?.code === STAFF_ROLE_CODES.MIDWIFE ||
      primaryRole?.code === STAFF_ROLE_CODES.WORKER ||
      (completeUser.staffProfiles && completeUser.staffProfiles.length > 0)
    ) {
      systemRole = SYSTEM_ROLES.STAF;
    }

    const tokenExpiresIn =
      this.configService.get('auth.expires', { infer: true }) || '1d';
    const token = await this.jwtService.signAsync(
      {
        id: completeUser.id,
        email: completeUser.email,
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
        sessionId: completeUser.id,
        hash: 'session_hash',
        id: completeUser.id,
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
      user: (await this.formatUser(completeUser)) as any,
    };
  }

  private async formatUser(userRecord: any) {
    const { authAccounts: _authAccounts, ...sanitizedUser } = userRecord;

    const primaryRole = sanitizedUser.userRoles_userId?.[0]?.role;
    let systemRole: SystemRole = SYSTEM_ROLES.PATIENT;
    if (primaryRole?.code === 'admin') {
      systemRole = SYSTEM_ROLES.ADMIN;
    } else if (
      primaryRole?.code === STAFF_ROLE_CODES.DOCTOR ||
      primaryRole?.code === STAFF_ROLE_CODES.MIDWIFE ||
      primaryRole?.code === STAFF_ROLE_CODES.WORKER ||
      (sanitizedUser.staffProfiles && sanitizedUser.staffProfiles.length > 0)
    ) {
      systemRole = SYSTEM_ROLES.STAF;
    }

    const p = sanitizedUser.patientProfiles?.[0];
    const primaryAddress =
      p?.patientAddresses?.find((a: any) => a.isPrimary) ||
      p?.patientAddresses?.[0];
    const primaryEmergency = p?.patientEmergencyContacts?.[0];

    const patient = p
      ? {
          id: p.id,
          userId: p.userId,
          medicalRecordNumber: p.medicalRecordNumber,
          nik: p.nationalIdEncrypted || p.nationalIdHash || '',
          fullName: p.fullName,
          gender: p.gender || null,
          birthPlace: p.birthPlace,
          birthDate:
            typeof p.birthDate === 'string'
              ? p.birthDate
              : p.birthDate?.toISOString?.()?.slice(0, 10) || null,
          bloodType: formatBloodTypeDisplay(p.bloodType),
          phoneNumber: p.phone,
          motherName: p.motherName || null,
          occupation: p.occupation || null,
          address: primaryAddress?.fullAddress || '',
          alamatDetail: primaryAddress?.line1 || null,
          provinsi: primaryAddress?.provinceName || null,
          provinsiId: primaryAddress?.provinceCode || null,
          kabupaten: primaryAddress?.regencyName || null,
          kabupatenId: primaryAddress?.regencyCode || null,
          kecamatan: primaryAddress?.districtName || null,
          kecamatanId: primaryAddress?.districtCode || null,
          kelurahan: primaryAddress?.villageName || null,
          kelurahanId: primaryAddress?.villageCode || null,
          emergencyContactName: primaryEmergency?.name || null,
          emergencyContactPhone: primaryEmergency?.phone || null,
          emergencyContactRelationship: primaryEmergency?.relationship || null,
          status: p.status,
        }
      : null;

    const s = sanitizedUser.staffProfiles?.[0];

    // Compute canonical avatar object and initials
    const fullName = s?.fullName || p?.fullName || sanitizedUser.name || '';
    const initials = NameInitialsHelper.getInitials(fullName);

    const storedAvatarUrl = sanitizedUser.avatarUrl || s?.avatarUrl || null;
    let avatarType: 'custom' | 'oauth' | 'initials' = 'initials';
    let hasCustomAvatar = false;

    if (storedAvatarUrl) {
      if (
        storedAvatarUrl.startsWith('http://') ||
        storedAvatarUrl.startsWith('https://')
      ) {
        if (
          storedAvatarUrl.includes('/api/v1/users/') &&
          storedAvatarUrl.includes('/avatar')
        ) {
          avatarType = 'custom';
          hasCustomAvatar = true;
        } else {
          avatarType = 'oauth';
          hasCustomAvatar = false;
        }
      } else {
        avatarType = 'custom';
        hasCustomAvatar = true;
      }
    }

    const canonicalAvatarUrl = `/api/v1/users/${sanitizedUser.id}/avatar`;
    const avatar = {
      url: canonicalAvatarUrl,
      initials,
      type: avatarType,
      hasCustomAvatar,
      directUrl: storedAvatarUrl || canonicalAvatarUrl,
    };

    const primaryStaffAddress =
      s?.addresses?.find((a: any) => a.isPrimary) || s?.addresses?.[0];

    const staff = s
      ? {
          id: s.id,
          userId: s.userId,
          practitionerId: s.practitioners?.[0]?.id || s.practitionerId || null,
          poliklinikId: s.primaryUnitId || s.poliklinikId || null,
          poliklinikName: s.clinicUnit?.name || s.poliklinikName || null,
          fullName: s.fullName,
          profession: s.positionTitle || s.profession || null,
          staffCode: s.staffCode || null,
          nationalId: s.nationalIdEncrypted || null,
          idCardNumber: s.staffCode || null,
          birthPlace: s.birthPlace || null,
          birthDate:
            typeof s.birthDate === 'string'
              ? s.birthDate
              : s.birthDate?.toISOString?.()?.slice(0, 10) || null,
          gender: s.gender || null,
          avatarUrl: s.avatarUrl || avatar.url,
          photoUrl: avatar.url,
          phoneNumber: s.phone,
          isActive: s.status === 'active',
          address: primaryStaffAddress
            ? {
                provinceCode: primaryStaffAddress.provinceCode || null,
                provinceName: primaryStaffAddress.provinceName || null,
                regencyCode: primaryStaffAddress.regencyCode || null,
                regencyName: primaryStaffAddress.regencyName || null,
                districtCode: primaryStaffAddress.districtCode || null,
                districtName: primaryStaffAddress.districtName || null,
                villageCode: primaryStaffAddress.villageCode || null,
                villageName: primaryStaffAddress.villageName || null,
                line1: primaryStaffAddress.line1 || null,
                fullAddress: primaryStaffAddress.fullAddress || null,
              }
            : null,
          fullAddress: primaryStaffAddress?.fullAddress || '',
          alamatDetail: primaryStaffAddress?.line1 || null,
          provinsi: primaryStaffAddress?.provinceName || null,
          provinsiId: primaryStaffAddress?.provinceCode || null,
          kabupaten: primaryStaffAddress?.regencyName || null,
          kabupatenId: primaryStaffAddress?.regencyCode || null,
          kecamatan: primaryStaffAddress?.districtName || null,
          kecamatanId: primaryStaffAddress?.districtCode || null,
          kelurahan: primaryStaffAddress?.villageName || null,
          kelurahanId: primaryStaffAddress?.villageCode || null,
        }
      : null;

    let needsOnboarding = false;
    if (systemRole === SYSTEM_ROLES.ADMIN) {
      needsOnboarding = false;
    } else if (systemRole === SYSTEM_ROLES.STAF) {
      const emailLower = (sanitizedUser.email || '').toLowerCase().trim();
      const pendingInvitation = emailLower
        ? await this.db.query.staffInvitations.findFirst({
            where: and(
              eq(staffInvitations.email, emailLower),
              eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
            ),
          })
        : null;

      if (pendingInvitation) {
        needsOnboarding = true;
      } else if (!s || s.status === STAFF_STATUS.INACTIVE) {
        needsOnboarding = true;
      } else {
        const hasAddress = Boolean(
          primaryStaffAddress?.provinceName ||
            primaryStaffAddress?.provinceCode ||
            primaryStaffAddress?.line1,
        );
        const hasDemographics = Boolean(s.birthDate && s.gender);
        needsOnboarding = !hasAddress || !hasDemographics;
      }
    } else {
      needsOnboarding = !patient;
    }

    return {
      ...sanitizedUser,
      avatarUrl: avatar.url,
      avatar,
      systemRole,
      role: {
        id: primaryRole?.id,
        code: primaryRole?.code,
        name: systemRole,
      },
      staff,
      patient,
      needsOnboarding,
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
    return user ? await this.formatUser(user) : null;
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
      // Anti-enumeration: return cleanly without throwing to prevent email probing
      return;
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

    // Atomic replay protection: single-use token enforcement via Redis with 30-minute TTL (1800s)
    const tokenUsedKey = `used_reset_token:${hash}`;
    const isSingleUse = await this.redisService.setNx(tokenUsedKey, '1', 1800);
    if (!isSingleUse) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: 'invalidHash',
        },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const credentialAccount = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.userId, payload.id),
        eq(authAccounts.providerId, 'credential'),
      ),
    });

    if (credentialAccount) {
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
    } else {
      await this.db.insert(authAccounts).values({
        userId: payload.id,
        providerId: 'credential',
        accountId: payload.email,
        passwordHash,
      });
    }

    try {
      const [betterAccount] = await this.db
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, payload.id),
            eq(account.providerId, 'credential'),
          ),
        )
        .limit(1);

      if (betterAccount) {
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
      } else {
        await this.db.insert(account).values({
          accountId: payload.id,
          providerId: 'credential',
          userId: payload.id,
          password: passwordHash,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Complementary sync
    }

    // Revoke all active Better Auth sessions upon password reset
    try {
      await this.db.delete(session).where(eq(session.userId, payload.id));
    } catch {
      // Non-blocking session revocation
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

  async resendOtp(dto: AuthResendOtpDto): Promise<ResendOtpResponseDto> {
    const cooldownKey = `cooldown:otp:${dto.type}:${dto.email}`;
    const remainingTtl = await this.redisService.getTtl(cooldownKey);

    if (remainingTtl > 0) {
      throw new HttpException(
        {
          message: `Mohon tunggu ${remainingTtl} detik sebelum meminta kode baru.`,
          code: 'RESEND_COOLDOWN_ACTIVE',
          retryAfter: remainingTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Rate limiting: maximum 5 resend requests per 15 minutes per email
    const rateLimit = await this.redisService.consumeRateLimit(
      `resend_burst:${dto.type}:${dto.email}`,
      5,
      900,
    );

    if (!rateLimit.allowed) {
      throw new HttpException(
        {
          message:
            'Batas permintaan kode OTP tercapai. Silakan coba lagi nanti.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimit.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Set 60 seconds cooldown in Redis
    await this.redisService.setString(cooldownKey, '1', 60);

    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (!userRecord) {
      // Anti-enumeration: Return success message without revealing absence
      return {
        success: true,
        message:
          'Jika email terdaftar, kode verifikasi baru telah dikirim ke email Anda.',
        cooldownSeconds: 60,
      };
    }

    if (dto.type === 'email-verification' && userRecord.emailVerified) {
      return {
        success: true,
        message: 'Alamat email ini sudah diverifikasi.',
        cooldownSeconds: 0,
      };
    }

    try {
      const betterAuthType =
        dto.type === 'forgot-password'
          ? 'forget-password'
          : 'email-verification';
      await auth.api.sendVerificationOTP({
        body: {
          email: dto.email,
          type: betterAuthType as any,
        },
      });
    } catch {
      // Non-blocking fallback
    }

    // If type is forgot-password, also trigger link refresh
    if (dto.type === 'forgot-password') {
      try {
        const tokenExpires = Date.now() + 1800000;
        const hash = await this.jwtService.signAsync(
          {
            id: userRecord.id,
            email: userRecord.email,
          },
          {
            secret: this.configService.getOrThrow('auth.forgotSecret', {
              infer: true,
            }),
            expiresIn: '30m',
          },
        );

        await this.mailService.forgotPassword({
          to: dto.email,
          data: {
            hash,
            tokenExpires,
          },
        });
      } catch {
        // Complementary
      }
    }

    return {
      success: true,
      message: 'Kode OTP baru berhasil dikirim ke email Anda.',
      cooldownSeconds: 60,
    };
  }

  async verifyEmailOtp(
    dto: AuthVerifyOtpDto,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await auth.api.verifyEmailOTP({
        body: {
          email: dto.email,
          otp: dto.otp,
        },
      });
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          otp: 'invalidOrExpiredOtp',
        },
      });
    }

    await this.db
      .update(users)
      .set({
        emailVerified: true,
        status: 'active',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.email, dto.email));

    return {
      success: true,
      message: 'Email berhasil diverifikasi.',
    };
  }

  async resetPasswordWithOtp(dto: AuthResetPasswordOtpDto): Promise<void> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (!userRecord) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'userNotFound',
        },
      });
    }

    try {
      await auth.api.resetPasswordEmailOTP({
        body: {
          email: dto.email,
          otp: dto.otp,
          password: dto.password,
        },
      });
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          otp: 'invalidOrExpiredOtp',
        },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const credentialAccount = await this.db.query.authAccounts.findFirst({
      where: and(
        eq(authAccounts.userId, userRecord.id),
        eq(authAccounts.providerId, 'credential'),
      ),
    });

    if (credentialAccount) {
      await this.db
        .update(authAccounts)
        .set({
          passwordHash,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(authAccounts.userId, userRecord.id),
            eq(authAccounts.providerId, 'credential'),
          ),
        );
    } else {
      await this.db.insert(authAccounts).values({
        userId: userRecord.id,
        providerId: 'credential',
        accountId: dto.email,
        passwordHash,
      });
    }

    try {
      await this.db.delete(session).where(eq(session.userId, userRecord.id));
    } catch {
      // Non-blocking
    }
  }

  async completeStaffOnboarding(
    userJwtPayload: JwtPayloadType,
    dto: AuthStaffOnboardingDto,
  ): Promise<any> {
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.id, userJwtPayload.id),
      with: {
        userRoles_userId: true,
        staffProfiles: true,
      },
    });

    if (!userRecord) {
      throw new UnauthorizedException('Pengguna tidak ditemukan di sistem.');
    }

    // 1. Determine role from DB / Invitation (SSOT, prevents client-side role escalation)
    const assignedUserRole = await this.db.query.userRoles.findFirst({
      where: eq(userRoles.userId, userRecord.id),
      with: {
        role: true,
      },
    });

    let effectiveRoleCode: string | undefined = assignedUserRole?.role?.code;

    const pendingInvitation = await this.db.query.staffInvitations.findFirst({
      where: and(
        eq(staffInvitations.email, userRecord.email.toLowerCase()),
        eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
      ),
    });

    if (pendingInvitation) {
      effectiveRoleCode = pendingInvitation.roleCode;
    }

    let betterAuthRole: BetterAuthStaffRole = BETTER_AUTH_STAFF_ROLES.DOCTOR;
    let rolesCode: StaffRoleCode = STAFF_ROLE_CODES.DOCTOR;
    let staffTypeVal: StaffType = STAFF_TYPES.DOCTOR;

    if (
      effectiveRoleCode === STAFF_ROLE_CODES.DOCTOR ||
      (!effectiveRoleCode && dto.role === StaffOnboardingRole.DOCTOR)
    ) {
      betterAuthRole = BETTER_AUTH_STAFF_ROLES.DOCTOR;
      rolesCode = STAFF_ROLE_CODES.DOCTOR;
      staffTypeVal = STAFF_TYPES.DOCTOR;
    } else if (
      effectiveRoleCode === STAFF_ROLE_CODES.MIDWIFE ||
      (!effectiveRoleCode && dto.role === StaffOnboardingRole.MIDWIFE)
    ) {
      betterAuthRole = BETTER_AUTH_STAFF_ROLES.MIDWIFE;
      rolesCode = STAFF_ROLE_CODES.MIDWIFE;
      staffTypeVal = STAFF_TYPES.MIDWIFE;
    } else {
      betterAuthRole = BETTER_AUTH_STAFF_ROLES.WORKER;
      rolesCode = STAFF_ROLE_CODES.WORKER;
      staffTypeVal = STAFF_TYPES.WORKER;
    }

    const defaultPrefix =
      staffTypeVal === STAFF_TYPES.DOCTOR
        ? 'STF-DOK'
        : staffTypeVal === STAFF_TYPES.MIDWIFE
          ? 'STF-BDN'
          : 'STF-ADM';
    const finalStaffCode =
      dto.staffCode?.trim() ||
      `${defaultPrefix}-${Date.now().toString().slice(-4)}`;

    const positionTitle =
      dto.profession?.trim() ||
      (staffTypeVal === STAFF_TYPES.DOCTOR
        ? 'Dokter'
        : staffTypeVal === STAFF_TYPES.MIDWIFE
          ? 'Bidan'
          : 'Staf Administrasi');
    const resolvedPoliklinikId = await this.resolveOnboardingPoliklinikId(
      dto.poliklinikId,
    );
    const userAvatarUrl = userRecord.avatarUrl?.trim() || null;

    await this.db.transaction(async (tx) => {
      // 1. Update Better Auth "user" table
      try {
        await tx
          .update(user)
          .set({
            role: betterAuthRole,
            name: dto.fullName.trim(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(user.id, userRecord.id));
      } catch {
        // Non-blocking if record is managed exclusively in users
      }

      // 2. Update users table
      await tx
        .update(users)
        .set({
          name: dto.fullName.trim(),
          phone: dto.phoneNumber?.trim() || userRecord.phone,
          status: USER_STATUS.ACTIVE,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, userRecord.id));

      // 3. Update user_roles
      const targetRole = await tx.query.roles.findFirst({
        where: eq(roles.code, rolesCode),
      });

      if (targetRole) {
        await tx.delete(userRoles).where(eq(userRoles.userId, userRecord.id));

        await tx.insert(userRoles).values({
          userId: userRecord.id,
          roleId: targetRole.id,
        });
      }

      // 4. Create or update staff_profiles
      let existingStaff = await tx.query.staffProfiles.findFirst({
        where: eq(staffProfiles.userId, userRecord.id),
      });

      const resolvedGender = dto.gender
        ? (dto.gender.toLowerCase() as 'male' | 'female')
        : existingStaff?.gender || null;

      if (existingStaff) {
        const [updated] = await tx
          .update(staffProfiles)
          .set({
            fullName: dto.fullName.trim(),
            staffCode: finalStaffCode,
            staffType: staffTypeVal,
            positionTitle,
            birthPlace: dto.birthPlace?.trim() || existingStaff.birthPlace,
            birthDate: dto.birthDate || existingStaff.birthDate,
            gender: resolvedGender || existingStaff.gender,
            nationalIdHash:
              dto.nationalId?.trim() || existingStaff.nationalIdHash,
            nationalIdEncrypted:
              dto.nationalId?.trim() || existingStaff.nationalIdEncrypted,
            phone: dto.phoneNumber?.trim() || existingStaff.phone,
            primaryUnitId: resolvedPoliklinikId || existingStaff.primaryUnitId,
            avatarUrl: existingStaff.avatarUrl || userAvatarUrl,
            status: STAFF_STATUS.ACTIVE,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffProfiles.id, existingStaff.id))
          .returning();
        existingStaff = updated;
      } else {
        const [created] = await tx
          .insert(staffProfiles)
          .values({
            userId: userRecord.id,
            staffCode: finalStaffCode,
            fullName: dto.fullName.trim(),
            staffType: staffTypeVal,
            positionTitle,
            birthPlace: dto.birthPlace?.trim() || null,
            birthDate: dto.birthDate || null,
            gender: resolvedGender,
            nationalIdHash: dto.nationalId?.trim() || null,
            nationalIdEncrypted: dto.nationalId?.trim() || null,
            phone: dto.phoneNumber?.trim(),
            email: userRecord.email,
            primaryUnitId: resolvedPoliklinikId,
            avatarUrl: userAvatarUrl,
            status: STAFF_STATUS.ACTIVE,
          })
          .returning();
        existingStaff = created;
      }

      // 5. Mark pending invitation accepted if exists
      if (pendingInvitation) {
        await tx
          .update(staffInvitations)
          .set({
            status: STAFF_INVITATION_STATUS.ACCEPTED,
            acceptedAt: new Date().toISOString(),
            acceptedUserId: userRecord.id,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffInvitations.id, pendingInvitation.id));
      }

      // 5. If clinical practitioner (doctor or midwife), create or update practitioner record
      const isClinicalPractitioner =
        (staffTypeVal === STAFF_TYPES.DOCTOR ||
          staffTypeVal === STAFF_TYPES.MIDWIFE) &&
        existingStaff;

      if (isClinicalPractitioner) {
        let practitionerId: string;
        const existingPractitioner = await tx.query.practitioners.findFirst({
          where: eq(practitioners.staffProfileId, existingStaff.id),
        });

        const targetSpecialtyCode =
          staffTypeVal === STAFF_TYPES.MIDWIFE
            ? MEDICAL_SPECIALTY_CODES.MATERNAL_CHILD_HEALTH
            : MEDICAL_SPECIALTY_CODES.GENERAL_PRACTITIONER;
        const matchedSpecialty = await tx.query.medicalSpecialties.findFirst({
          where: eq(medicalSpecialties.code, targetSpecialtyCode),
        });

        if (!existingPractitioner) {
          const [newPractitioner] = await tx
            .insert(practitioners)
            .values({
              staffProfileId: existingStaff.id,
              displayName: dto.fullName.trim(),
              licenseNumber: dto.licenseNumber?.trim() || null,
              specialtyId: matchedSpecialty?.id || null,
              isAcceptingAppointments: true,
            })
            .returning();
          practitionerId = newPractitioner.id;
        } else {
          practitionerId = existingPractitioner.id;
          await tx
            .update(practitioners)
            .set({
              displayName: dto.fullName.trim(),
              licenseNumber:
                dto.licenseNumber?.trim() || existingPractitioner.licenseNumber,
              specialtyId:
                existingPractitioner.specialtyId || matchedSpecialty?.id || null,
              isAcceptingAppointments: true,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(practitioners.id, existingPractitioner.id));
        }

        // Seed default generic doctor assignments (dow: null) if doctor/midwife has no assignments yet
        const existingAssignments = await tx.query.doctorAssignments.findMany({
          where: eq(doctorAssignments.doctorId, practitionerId),
        });

        if (existingAssignments.length === 0) {
          const activeSessionDefs = await tx.query.sessionDefs.findMany({
            where: eq(sessionDefs.isActive, true),
          });

          if (activeSessionDefs.length > 0) {
            await tx.insert(doctorAssignments).values(
              activeSessionDefs.map((def: any) => ({
                doctorId: practitionerId,
                sessionId: def.id,
                dow: null,
                isActive: true,
              })),
            );
          }
        }
      }

      // 6. Regional Address persistence in staff_addresses (Flutter & onboarding SSOT)
      if (existingStaff) {
        const provName = dto.provinsi?.trim();
        const provCode = dto.provinsi_id?.trim() || dto.provinsiId?.trim();
        const regName = dto.kabupaten?.trim();
        const regCode = dto.kabupaten_id?.trim() || dto.kabupatenId?.trim();
        const distName = dto.kecamatan?.trim();
        const distCode = dto.kecamatan_id?.trim() || dto.kecamatanId?.trim();
        const villName = dto.kelurahan?.trim();
        const villCode = dto.kelurahan_id?.trim() || dto.kelurahanId?.trim();
        const streetLine1 =
          dto.alamat_detail?.trim() ||
          dto.alamatDetail?.trim() ||
          dto.line1?.trim() ||
          '';

        if (streetLine1 || provName || regName) {
          const fullAddress = [
            streetLine1,
            villName ? `Kel. ${villName}` : null,
            distName ? `Kec. ${distName}` : null,
            regName,
            provName ? `Prov. ${provName}` : null,
          ]
            .filter(Boolean)
            .join(', ');

          const existingAddress = await tx.query.staffAddresses.findFirst({
            where: and(
              eq(staffAddresses.staffProfileId, existingStaff.id),
              eq(staffAddresses.isPrimary, true),
            ),
          });

          if (existingAddress) {
            await tx
              .update(staffAddresses)
              .set({
                provinceCode: provCode || existingAddress.provinceCode,
                provinceName: provName || existingAddress.provinceName,
                regencyCode: regCode || existingAddress.regencyCode,
                regencyName: regName || existingAddress.regencyName,
                districtCode: distCode || existingAddress.districtCode,
                districtName: distName || existingAddress.districtName,
                villageCode: villCode || existingAddress.villageCode,
                villageName: villName || existingAddress.villageName,
                line1: streetLine1 || existingAddress.line1,
                fullAddress: fullAddress || existingAddress.fullAddress,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(staffAddresses.id, existingAddress.id));
          } else {
            await tx.insert(staffAddresses).values({
              staffProfileId: existingStaff.id,
              type: 'domicile',
              provinceCode: provCode || null,
              provinceName: provName || null,
              regencyCode: regCode || null,
              regencyName: regName || null,
              districtCode: distCode || null,
              districtName: distName || null,
              villageCode: villCode || null,
              villageName: villName || null,
              line1: streetLine1 || null,
              fullAddress: fullAddress || streetLine1 || null,
              isPrimary: true,
            });
          }
        }
      }
    });

    try {
      await this.redisService.invalidateTags(
        'schedule',
        'schedule:list',
        'schedule:detail',
      );
    } catch {
      // safe fallback
    }

    return this.me(userJwtPayload);
  }

  async logout(data: {
    sessionId?: string;
    userId?: string;
    token?: string;
  }): Promise<void> {
    if (data.token) {
      // Blacklist token in Redis for 24 hours (86400s)
      await this.redisService.setString(
        `blacklist:token:${data.token}`,
        '1',
        86400,
      );
    }

    if (data.sessionId) {
      try {
        await this.db.delete(session).where(eq(session.id, data.sessionId));
      } catch {
        // Non-blocking
      }
    }

    if (data.userId) {
      try {
        await this.db.delete(session).where(eq(session.userId, data.userId));
      } catch {
        // Non-blocking
      }
    }
  }
}

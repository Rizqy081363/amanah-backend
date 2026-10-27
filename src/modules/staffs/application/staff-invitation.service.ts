import { createHash, randomBytes } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { RedisService } from '../../../common/redis/redis.service';
import {
  IPasswordGenerator,
  PASSWORD_GENERATOR_TOKEN,
} from '../../../common/services/password-generator.interface';
import { AllConfigType } from '../../../config/config.type';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  clinicUnits,
  medicalSpecialties,
  practitioners,
  roles,
  session,
  staffProfiles,
  user,
  userRoles,
  users,
} from '../../../database/schema';
import { MailService } from '../../../mail/mail.service';
import {
  BETTER_AUTH_STAFF_ROLES,
  BetterAuthStaffRole,
  STAFF_INVITATION_STATUS,
  STAFF_ROLE_CODES,
  STAFF_STATUS,
  STAFF_TYPES,
  StaffRoleCode,
  StaffType,
} from '../domain/constants/staff-invitation.constants';
import { USER_STATUS } from '../../../auth/constants/auth.constants';
import { MEDICAL_SPECIALTY_CODES } from '../../clinics/domain/constants/medical-specialty.constants';
import { StaffInvitationEntity } from '../domain/entities/staff-invitation.entity';
import {
  STAFF_INVITATION_REPOSITORY,
  StaffInvitationRepository,
} from '../domain/repositories/staff-invitation.repository';
import { InviteDoctorDto } from '../presentation/dto/invite-doctor.dto';
import { InviteStaffDto } from '../presentation/dto/invite-staff.dto';

@Injectable()
export class StaffInvitationService {
  private readonly logger = new Logger(StaffInvitationService.name);

  constructor(
    @Inject(STAFF_INVITATION_REPOSITORY)
    private readonly invitationRepo: StaffInvitationRepository,
    @Inject(PASSWORD_GENERATOR_TOKEN)
    private readonly passwordGenerator: IPasswordGenerator,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly mailService: MailService,
    private readonly configService: ConfigService<AllConfigType>,
    @Optional()
    @Inject(RedisService)
    private readonly redisService?: RedisService,
  ) {}

  async getInvitationOptions(): Promise<{
    practitionerRoles: Array<{
      code: string;
      name: string;
      description: string | null;
    }>;
    polyclinics: Array<{ id: string; name: string; code: string }>;
  }> {
    const practitionerRoles = await this.db.query.roles.findMany({
      where: inArray(roles.code, [
        STAFF_ROLE_CODES.DOCTOR,
        STAFF_ROLE_CODES.MIDWIFE,
      ]),
    });

    const polyclinics = await this.db.query.clinicUnits.findMany({
      where: and(
        eq(clinicUnits.unitType, 'polyclinic'),
        eq(clinicUnits.isActive, true),
      ),
      orderBy: [asc(clinicUnits.name)],
    });

    return {
      practitionerRoles: practitionerRoles.map((r) => ({
        code: r.code,
        name:
          r.code === STAFF_ROLE_CODES.DOCTOR
            ? 'Dokter'
            : r.code === STAFF_ROLE_CODES.MIDWIFE
              ? 'Bidan'
              : r.name,
        description: r.description,
      })),
      polyclinics: polyclinics.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
      })),
    };
  }

  async inviteDoctor(
    dto: InviteDoctorDto,
    adminUserId: string,
  ): Promise<{
    invitation: StaffInvitationEntity;
    temporaryPassword: string;
    loginUrl: string;
  }> {
    const email = dto.email.toLowerCase().trim();
    const doctorName = dto.fullName?.trim() || email.split('@')[0];

    // Check for existing pending invitation and revoke if exists
    const existingPending = await this.invitationRepo.findPendingByEmail(email);
    if (existingPending) {
      await this.revokeInvitation(existingPending.id);
    }

    const temporaryPassword = this.passwordGenerator.generate(14);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const roleCode: StaffRoleCode =
      dto.roleCode === STAFF_ROLE_CODES.MIDWIFE
        ? STAFF_ROLE_CODES.MIDWIFE
        : STAFF_ROLE_CODES.DOCTOR;
    const isMidwife = roleCode === STAFF_ROLE_CODES.MIDWIFE;
    const staffType: StaffType = isMidwife
      ? STAFF_TYPES.MIDWIFE
      : STAFF_TYPES.DOCTOR;
    const betterAuthRole: BetterAuthStaffRole = isMidwife
      ? BETTER_AUTH_STAFF_ROLES.MIDWIFE
      : BETTER_AUTH_STAFF_ROLES.DOCTOR;
    const prefix = isMidwife ? 'BDN' : 'DOC';

    // 1. Create or update user account
    let userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!userRecord) {
      const [newUser] = await this.db
        .insert(users)
        .values({
          name: doctorName,
          email,
          emailVerified: true,
          phone: null,
          status: USER_STATUS.ACTIVE,
          preferredLocale: 'id-ID',
        })
        .returning();
      userRecord = newUser;

      await this.db.insert(authAccounts).values({
        userId: userRecord.id,
        providerId: 'credential',
        accountId: email,
        passwordHash,
      });

      try {
        await this.db.insert(user).values({
          id: userRecord.id,
          name: doctorName,
          email,
          emailVerified: true,
          role: betterAuthRole,
          banned: false,
        });

        await this.db.insert(account).values({
          accountId: userRecord.id,
          providerId: 'credential',
          userId: userRecord.id,
          password: passwordHash,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Better Auth parity
      }
    } else {
      // Update existing credential account with new temporary password
      await this.db
        .update(authAccounts)
        .set({ passwordHash, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(authAccounts.userId, userRecord.id),
            eq(authAccounts.providerId, 'credential'),
          ),
        );

      try {
        await this.db
          .update(account)
          .set({ password: passwordHash, updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(account.userId, userRecord.id),
              eq(account.providerId, 'credential'),
            ),
          );
      } catch {
        // Better Auth parity
      }
    }

    // 2. Assign practitioner role in user_roles
    const practitionerRole = await this.db.query.roles.findFirst({
      where: eq(roles.code, roleCode),
    });
    if (practitionerRole) {
      await this.db
        .delete(userRoles)
        .where(eq(userRoles.userId, userRecord.id));
      await this.db.insert(userRoles).values({
        userId: userRecord.id,
        roleId: practitionerRole.id,
        assignedBy: adminUserId || null,
      });
    }

    // 3. Resolve clinical unit and canonical specialty from DB
    const assignedUnit = dto.poliklinikId
      ? await this.db.query.clinicUnits.findFirst({
          where: eq(clinicUnits.id, dto.poliklinikId),
        })
      : null;

    const isKiaPolyclinic = assignedUnit?.code === 'poli_kia';
    const targetSpecialtyCode =
      isMidwife || isKiaPolyclinic
        ? MEDICAL_SPECIALTY_CODES.MATERNAL_CHILD_HEALTH
        : MEDICAL_SPECIALTY_CODES.GENERAL_PRACTITIONER;

    const matchedSpecialty = await this.db.query.medicalSpecialties.findFirst({
      where: eq(medicalSpecialties.code, targetSpecialtyCode),
    });

    const canonicalPositionTitle =
      matchedSpecialty?.name || (isMidwife ? 'Bidan' : 'Dokter');

    // 4. Create or update staff_profiles
    let staff = await this.db.query.staffProfiles.findFirst({
      where: or(
        eq(staffProfiles.userId, userRecord.id),
        eq(staffProfiles.email, email),
      ),
    });

    if (!staff) {
      const staffCode = `${prefix}-${Date.now().toString().slice(-4)}`;
      const [newStaff] = await this.db
        .insert(staffProfiles)
        .values({
          userId: userRecord.id,
          staffCode,
          fullName: doctorName,
          staffType,
          positionTitle: canonicalPositionTitle,
          primaryUnitId: dto.poliklinikId,
          phone: null,
          email,
          status: STAFF_STATUS.INACTIVE,
        })
        .returning();
      staff = newStaff;
    } else {
      const [updated] = await this.db
        .update(staffProfiles)
        .set({
          fullName: doctorName,
          staffType,
          primaryUnitId: dto.poliklinikId,
          positionTitle: canonicalPositionTitle,
          status: STAFF_STATUS.INACTIVE,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(staffProfiles.id, staff.id))
        .returning();
      staff = updated;
    }

    // 5. Create or update practitioners record (Clinical Practitioner)
    if (staff) {
      const existingPractitioner = await this.db.query.practitioners.findFirst({
        where: eq(practitioners.staffProfileId, staff.id),
      });

      if (!existingPractitioner) {
        await this.db.insert(practitioners).values({
          staffProfileId: staff.id,
          displayName: doctorName,
          specialtyId: matchedSpecialty?.id || null,
          licenseNumber: null,
          isAcceptingAppointments: false,
        });
      } else {
        await this.db
          .update(practitioners)
          .set({
            displayName: doctorName,
            specialtyId:
              existingPractitioner.specialtyId || matchedSpecialty?.id || null,
            isAcceptingAppointments: false,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(practitioners.id, existingPractitioner.id));
      }
    }

    // 5. Store staff_invitations record
    const invitation = await this.invitationRepo.create({
      email,
      roleCode,
      staffType,
      tokenHash,
      temporaryPasswordHash: passwordHash,
      invitedBy: adminUserId,
      status: STAFF_INVITATION_STATUS.PENDING,
      expiresAt,
      metadata: {
        fullName: doctorName,
        poliklinikId: dto.poliklinikId,
        roleCode,
      },
    });

    // 6. Build login url & dispatch invitation email
    const frontendDomain =
      this.configService.get('app.frontendDomain', { infer: true }) || '';
    const loginUrl = `${frontendDomain}/auth/sign-in?email=${encodeURIComponent(email)}`;

    try {
      await this.mailService.sendStaffInvitation({
        to: email,
        data: {
          name: doctorName,
          roleTitle: canonicalPositionTitle,
          temporaryPassword,
          loginUrl,
          expiresAt: expiresAt.toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to dispatch email to ${email}:`, err);
    }

    try {
      await this.redisService?.invalidateTags(
        'schedule',
        'schedule:list',
        'schedule:detail',
      );
    } catch {
      // safe fallback
    }

    return {
      invitation,
      temporaryPassword,
      loginUrl,
    };
  }

  async inviteStaff(
    dto: InviteStaffDto,
    adminUserId: string,
  ): Promise<{
    invitation: StaffInvitationEntity;
    temporaryPassword: string;
    loginUrl: string;
  }> {
    const email = dto.email.toLowerCase().trim();

    // Check for existing pending invitation and revoke if exists
    const existingPending = await this.invitationRepo.findPendingByEmail(email);
    if (existingPending) {
      await this.revokeInvitation(existingPending.id);
    }

    const temporaryPassword = this.passwordGenerator.generate(14);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const roleCode: StaffRoleCode = STAFF_ROLE_CODES.WORKER;
    const staffType: StaffType = STAFF_TYPES.WORKER;
    const betterAuthRole: BetterAuthStaffRole = BETTER_AUTH_STAFF_ROLES.WORKER;
    const roleTitle = 'Staf Operasional';
    const staffName = dto.fullName?.trim() || email.split('@')[0];

    // 1. Create or update user account
    let userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!userRecord) {
      const [newUser] = await this.db
        .insert(users)
        .values({
          name: staffName,
          email,
          emailVerified: true,
          phone: null,
          status: USER_STATUS.ACTIVE,
          preferredLocale: 'id-ID',
        })
        .returning();
      userRecord = newUser;

      await this.db.insert(authAccounts).values({
        userId: userRecord.id,
        providerId: 'credential',
        accountId: email,
        passwordHash,
      });

      try {
        await this.db.insert(user).values({
          id: userRecord.id,
          name: staffName,
          email,
          emailVerified: true,
          role: betterAuthRole,
          banned: false,
        });

        await this.db.insert(account).values({
          accountId: userRecord.id,
          providerId: 'credential',
          userId: userRecord.id,
          password: passwordHash,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Better Auth parity
      }
    } else {
      await this.db
        .update(authAccounts)
        .set({ passwordHash, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(authAccounts.userId, userRecord.id),
            eq(authAccounts.providerId, 'credential'),
          ),
        );

      try {
        await this.db
          .update(account)
          .set({ password: passwordHash, updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(account.userId, userRecord.id),
              eq(account.providerId, 'credential'),
            ),
          );
      } catch {
        // Better Auth parity
      }
    }

    // 2. Assign role in user_roles
    const roleRecord = await this.db.query.roles.findFirst({
      where: eq(roles.code, roleCode),
    });
    if (roleRecord) {
      await this.db
        .delete(userRoles)
        .where(eq(userRoles.userId, userRecord.id));
      await this.db.insert(userRoles).values({
        userId: userRecord.id,
        roleId: roleRecord.id,
        assignedBy: adminUserId || null,
      });
    }

    // 3. Create or update staff_profiles (independent operational worker, NO practitioner attachment)
    let staff = await this.db.query.staffProfiles.findFirst({
      where: or(
        eq(staffProfiles.userId, userRecord.id),
        eq(staffProfiles.email, email),
      ),
    });

    if (!staff) {
      const prefix = 'STF';
      const staffCode = `${prefix}-${Date.now().toString().slice(-4)}`;
      const [newStaff] = await this.db
        .insert(staffProfiles)
        .values({
          userId: userRecord.id,
          staffCode,
          fullName: staffName,
          staffType,
          positionTitle: roleTitle,
          primaryUnitId: null,
          phone: null,
          email,
          status: STAFF_STATUS.INACTIVE,
        })
        .returning();
      staff = newStaff;
    } else {
      const [updated] = await this.db
        .update(staffProfiles)
        .set({
          fullName: staffName,
          staffType,
          positionTitle: roleTitle,
          status: STAFF_STATUS.INACTIVE,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(staffProfiles.id, staff.id))
        .returning();
      staff = updated;
    }

    // 4. Store staff_invitations record
    const invitation = await this.invitationRepo.create({
      email,
      roleCode,
      staffType,
      tokenHash,
      temporaryPasswordHash: passwordHash,
      invitedBy: adminUserId,
      status: STAFF_INVITATION_STATUS.PENDING,
      expiresAt,
      metadata: {
        fullName: staffName,
        roleCode,
      },
    });

    // 5. Build login url & dispatch invitation email
    const frontendDomain =
      this.configService.get('app.frontendDomain', { infer: true }) || '';
    const loginUrl = `${frontendDomain}/auth/sign-in?email=${encodeURIComponent(email)}`;

    try {
      await this.mailService.sendStaffInvitation({
        to: email,
        data: {
          name: staffName,
          roleTitle,
          temporaryPassword,
          loginUrl,
          expiresAt: expiresAt.toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to dispatch email to ${email}:`, err);
    }

    return {
      invitation,
      temporaryPassword,
      loginUrl,
    };
  }

  async listInvitations(status?: string): Promise<StaffInvitationEntity[]> {
    return this.invitationRepo.findAll({ status });
  }

  async revokeInvitation(id: string): Promise<StaffInvitationEntity> {
    const existing = await this.invitationRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Undangan dengan ID ${id} tidak ditemukan`);
    }

    const updated = await this.invitationRepo.updateStatus(
      id,
      STAFF_INVITATION_STATUS.REVOKED,
    );
    if (!updated) {
      throw new NotFoundException(`Undangan dengan ID ${id} tidak ditemukan`);
    }

    // Invalidate user credentials, staffProfile, practitioner, and active sessions
    const userRecord = await this.db.query.users.findFirst({
      where: eq(users.email, existing.email.toLowerCase().trim()),
    });

    if (userRecord) {
      // 1. Invalidate temporary password in authAccounts
      await this.db
        .update(authAccounts)
        .set({
          passwordHash: null,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(authAccounts.userId, userRecord.id),
            eq(authAccounts.providerId, 'credential'),
          ),
        );

      // 2. Invalidate Better-Auth account password
      try {
        await this.db
          .update(account)
          .set({
            password: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(account.userId, userRecord.id),
              eq(account.providerId, 'credential'),
            ),
          );
      } catch {
        // parity safe
      }

      // 3. Mark user inactive
      await this.db
        .update(users)
        .set({ status: USER_STATUS.INACTIVE, updatedAt: new Date().toISOString() })
        .where(eq(users.id, userRecord.id));

      // 4. Inactivate staff_profile
      const staff = await this.db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.userId, userRecord.id),
      });

      if (staff) {
        await this.db
          .update(staffProfiles)
          .set({
            status: STAFF_STATUS.INACTIVE,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffProfiles.id, staff.id));

        // 5. If doctor, disable practitioner appointments
        await this.db
          .update(practitioners)
          .set({
            isAcceptingAppointments: false,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(practitioners.staffProfileId, staff.id));
      }

      // 6. Purge active sessions
      try {
        await this.db.delete(session).where(eq(session.userId, userRecord.id));
      } catch {
        // parity safe
      }
    }

    return updated;
  }
}

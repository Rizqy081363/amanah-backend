import { createHash, randomBytes } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { and, eq, or } from 'drizzle-orm';
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
  practitioners,
  roles,
  staffProfiles,
  user,
  userRoles,
  users,
} from '../../../database/schema';
import { MailService } from '../../../mail/mail.service';
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
  ) {}

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
      await this.invitationRepo.updateStatus(existingPending.id, 'revoked');
    }

    const temporaryPassword = this.passwordGenerator.generate(14);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
          status: 'active',
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
          role: 'staffDoctor',
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

    // 2. Assign staff_doctor role in user_roles
    const doctorRole = await this.db.query.roles.findFirst({
      where: eq(roles.code, 'staff_doctor'),
    });
    if (doctorRole) {
      await this.db
        .delete(userRoles)
        .where(eq(userRoles.userId, userRecord.id));
      await this.db.insert(userRoles).values({
        userId: userRecord.id,
        roleId: doctorRole.id,
        assignedBy: adminUserId || null,
      });
    }

    // 3. Create or update staff_profiles
    let staff = await this.db.query.staffProfiles.findFirst({
      where: or(
        eq(staffProfiles.userId, userRecord.id),
        eq(staffProfiles.email, email),
      ),
    });

    if (!staff) {
      const staffCode = `DOC-${Date.now().toString().slice(-4)}`;
      const [newStaff] = await this.db
        .insert(staffProfiles)
        .values({
          userId: userRecord.id,
          staffCode,
          fullName: doctorName,
          staffType: 'doctor',
          positionTitle: 'Dokter',
          primaryUnitId: dto.poliklinikId,
          phone: null,
          email,
          status: 'active',
        })
        .returning();
      staff = newStaff;
    } else {
      const [updated] = await this.db
        .update(staffProfiles)
        .set({
          fullName: doctorName,
          staffType: 'doctor',
          primaryUnitId: dto.poliklinikId,
          positionTitle: 'Dokter',
          status: 'active',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(staffProfiles.id, staff.id))
        .returning();
      staff = updated;
    }

    // 4. Create or update practitioners record (Clinical Practitioner)
    if (staff) {
      const existingPractitioner = await this.db.query.practitioners.findFirst({
        where: eq(practitioners.staffProfileId, staff.id),
      });

      if (!existingPractitioner) {
        await this.db.insert(practitioners).values({
          staffProfileId: staff.id,
          displayName: doctorName,
          licenseNumber: null,
          isAcceptingAppointments: true,
        });
      } else {
        await this.db
          .update(practitioners)
          .set({
            displayName: doctorName,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(practitioners.id, existingPractitioner.id));
      }
    }

    // 5. Store staff_invitations record
    const invitation = await this.invitationRepo.create({
      email,
      roleCode: 'staff_doctor',
      staffType: 'doctor',
      tokenHash,
      temporaryPasswordHash: passwordHash,
      invitedBy: adminUserId,
      status: 'pending',
      expiresAt,
      metadata: {
        fullName: doctorName,
        poliklinikId: dto.poliklinikId,
      },
    });

    // 6. Build login url & dispatch invitation email
    const frontendDomain =
      this.configService.get('app.frontendDomain', { infer: true }) ||
      'http://localhost:3000';
    const loginUrl = `${frontendDomain}/auth/sign-in?email=${encodeURIComponent(email)}`;

    try {
      await this.mailService.sendStaffInvitation({
        to: email,
        data: {
          name: doctorName,
          roleTitle: 'Dokter',
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
      await this.invitationRepo.updateStatus(existingPending.id, 'revoked');
    }

    const temporaryPassword = this.passwordGenerator.generate(14);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const roleCode = dto.roleCode || 'staff_worker';
    const staffType: 'midwife' | 'worker' =
      roleCode === 'staff_midwife' ? 'midwife' : 'worker';
    const betterAuthRole =
      roleCode === 'staff_midwife' ? 'staffMidwife' : 'staffWorker';
    const roleTitle =
      roleCode === 'staff_midwife' ? 'Bidan' : 'Staf Operasional';
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
          status: 'active',
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
      const prefix = staffType === 'midwife' ? 'BDN' : 'STF';
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
          status: 'active',
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
          status: 'active',
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
      status: 'pending',
      expiresAt,
      metadata: {
        fullName: staffName,
        roleCode,
      },
    });

    // 5. Build login url & dispatch invitation email
    const frontendDomain =
      this.configService.get('app.frontendDomain', { infer: true }) ||
      'http://localhost:3000';
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
    const updated = await this.invitationRepo.updateStatus(id, 'revoked');
    if (!updated) {
      throw new NotFoundException(`Undangan dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }
}

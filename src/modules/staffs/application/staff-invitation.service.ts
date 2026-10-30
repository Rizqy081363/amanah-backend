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
import { and, asc, eq, or } from 'drizzle-orm';
import { RedisService } from '../../../common/redis/redis.service';
import {
  IPasswordGenerator,
  PASSWORD_GENERATOR_TOKEN,
} from '../../../common/services/password-generator.interface';
import { AllConfigType } from '../../../config/config.type';
import { ClinicTimeService } from '../../../common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  account,
  authAccounts,
  clinicUnits,
  practitioners,
  roles,
  session,
  staffProfiles,
  user,
  userRoles,
  users,
} from '../../../database/schema';
import { ROLE_AUDIENCE } from '../../../common/constants/role-audience.constants';
import { MailService } from '../../../mail/mail.service';
import {
  STAFF_INVITATION_STATUS,
  STAFF_STATUS,
} from '../domain/constants/staff-invitation.constants';
import {
  REALTIME_GATEWAY_PORT,
  REALTIME_ROOMS,
} from '../../notifications/notifications.constants';
import { SocketIoRealtimeGateway } from '../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { USER_STATUS } from '../../../common/constants/user-status.constants';
import { StaffInvitationEntity } from '../domain/entities/staff-invitation.entity';
import {
  STAFF_INVITATION_REPOSITORY,
  StaffInvitationRepository,
} from '../domain/repositories/staff-invitation.repository';
import { InviteStaffUniversalDto } from '../presentation/dto/invite-staff-universal.dto';

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
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  private getNowDate(): Date {
    return this.clinicTimeService
      ? this.clinicTimeService.nowDate()
      : new Date();
  }

  private getNowIso(): string {
    return this.getNowDate().toISOString();
  }

  async getInvitationOptions(): Promise<{
    roles: Array<{
      id: string;
      code: string;
      name: string;
      tier: string;
      parentRoleId: string | null;
      isClinical: boolean;
      description: string | null;
    }>;
    practitionerRoles: Array<{
      id: string;
      code: string;
      name: string;
      tier: string;
      parentRoleId: string | null;
      description: string | null;
    }>;
    polyclinics: Array<{ id: string; name: string; code: string; unitType?: string; iconName?: string }>;
    clinicUnits: Array<{ id: string; name: string; code: string; unitType?: string; iconName?: string }>;
  }> {
    const staffRoles = await this.db.query.roles.findMany({
      where: eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
      orderBy: [asc(roles.name)],
    });

    const activeClinicUnits = await this.db.query.clinicUnits.findMany({
      where: eq(clinicUnits.isActive, true),
      orderBy: [asc(clinicUnits.name)],
    });

    const unitsMapped = activeClinicUnits.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      unitType: p.unitType,
      iconName: p.iconName,
    }));

    return {
      roles: staffRoles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        tier: r.tier,
        parentRoleId: r.parentRoleId || null,
        isClinical: r.isClinical,
        description: r.description,
      })),
      practitionerRoles: staffRoles
        .filter((r) => r.isClinical)
        .map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          tier: r.tier,
          parentRoleId: r.parentRoleId || null,
          description: r.description,
        })),
      polyclinics: unitsMapped,
      clinicUnits: unitsMapped,
    };
  }

  async inviteStaffUniversal(
    dto: InviteStaffUniversalDto,
    adminUserId: string,
  ): Promise<{
    invitation: StaffInvitationEntity;
    temporaryPassword: string;
    loginUrl: string;
  }> {
    const email = dto.email.toLowerCase().trim();
    const staffName = dto.fullName?.trim() || email.split('@')[0];

    // 1. Resolve role from DB (Single Source of Truth)
    const targetRole = await this.db.query.roles.findFirst({
      where: eq(roles.id, dto.roleId),
    });
    if (!targetRole) {
      throw new NotFoundException(`Peran dengan ID ${dto.roleId} tidak ditemukan`);
    }

    const isClinical = targetRole.isClinical;
    const roleCode = targetRole.code;
    const roleTitle = targetRole.name;

    // Check for existing pending invitation and revoke if exists
    const existingPending = await this.invitationRepo.findPendingByEmail(email);
    if (existingPending) {
      await this.revokeInvitation(existingPending.id);
    }

    const temporaryPassword = this.passwordGenerator.generate(14);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const expiresAt = new Date(
      this.getNowDate().getTime() + 7 * 24 * 60 * 60 * 1000,
    ); // 7 days

    // 2. Create or update user account
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
          role: roleCode,
          banned: false,
        });

        await this.db.insert(account).values({
          accountId: userRecord.id,
          providerId: 'credential',
          userId: userRecord.id,
          password: passwordHash,
          updatedAt: this.getNowIso(),
        });
      } catch {
        // Better Auth parity
      }
    } else {
      await this.db
        .update(authAccounts)
        .set({ passwordHash, updatedAt: this.getNowIso() })
        .where(
          and(
            eq(authAccounts.userId, userRecord.id),
            eq(authAccounts.providerId, 'credential'),
          ),
        );

      try {
        await this.db
          .update(account)
          .set({ password: passwordHash, updatedAt: this.getNowIso() })
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

    // 3. Assign role in user_roles
    await this.db
      .delete(userRoles)
      .where(eq(userRoles.userId, userRecord.id));
    await this.db.insert(userRoles).values({
      userId: userRecord.id,
      roleId: targetRole.id,
      assignedBy: adminUserId || null,
    });

    // 4. Create or update staff_profiles
    let staff = await this.db.query.staffProfiles.findFirst({
      where: or(
        eq(staffProfiles.userId, userRecord.id),
        eq(staffProfiles.email, email),
      ),
    });

    const targetUnitId = dto.unitId || dto.poliklinikId || null;
    const prefix = isClinical ? 'CLN' : 'STF';
    if (!staff) {
      const staffCode = `${prefix}-${Date.now().toString().slice(-4)}`;
      const [newStaff] = await this.db
        .insert(staffProfiles)
        .values({
          userId: userRecord.id,
          roleId: targetRole.id,
          staffCode,
          fullName: staffName,
          positionTitle: roleTitle,
          primaryUnitId: targetUnitId,
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
          roleId: targetRole.id,
          fullName: staffName,
          positionTitle: roleTitle,
          primaryUnitId: targetUnitId || staff.primaryUnitId,
          status: STAFF_STATUS.INACTIVE,
          updatedAt: this.getNowIso(),
        })
        .where(eq(staffProfiles.id, staff.id))
        .returning();
      staff = updated;
    }

    // 5. Clinical Practitioner record management
    if (staff && isClinical) {
      const existingPractitioner = await this.db.query.practitioners.findFirst({
        where: eq(practitioners.staffProfileId, staff.id),
      });

      if (!existingPractitioner) {
        await this.db.insert(practitioners).values({
          staffProfileId: staff.id,
          displayName: staffName,
          specialtyId: null,
          licenseNumber: null,
          isAcceptingAppointments: false,
        });
      } else {
        await this.db
          .update(practitioners)
          .set({
            displayName: staffName,
            updatedAt: this.getNowIso(),
          })
          .where(eq(practitioners.id, existingPractitioner.id));
      }
    }

    // 6. Store staff_invitations record
    const invitation = await this.invitationRepo.create({
      email,
      roleId: targetRole.id,
      roleCode,
      tokenHash,
      temporaryPasswordHash: passwordHash,
      invitedBy: adminUserId,
      status: STAFF_INVITATION_STATUS.PENDING,
      expiresAt,
      metadata: {
        fullName: staffName,
        poliklinikId: dto.poliklinikId || null,
        roleId: targetRole.id,
        roleCode,
      },
    });

    // 7. Dispatch invitation email
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

    try {
      await this.redisService?.invalidateTags(
        'schedule',
        'schedule:list',
        'schedule:detail',
      );
    } catch {
      // safe fallback
    }

    try {
      const realtimePayload = {
        invitationId: invitation.id,
        email: invitation.email,
        roleId: targetRole.id,
        roleCode: invitation.roleCode,
        fullName: staffName,
        status: invitation.status,
        expiresAt:
          invitation.expiresAt instanceof Date
            ? invitation.expiresAt.toISOString()
            : String(invitation.expiresAt),
        createdAt: this.getNowIso(),
      };
      void this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'staff:invited',
        realtimePayload,
      );
      void this.realtimeGateway?.emitToRole?.(
        'admin',
        'staff:invited',
        realtimePayload,
      );
      void this.realtimeGateway?.emitToRole?.(
        'admin',
        'staff:updated',
        realtimePayload,
      );
    } catch (realtimeErr) {
      this.logger.warn(
        `Failed to emit staff:invited realtime event: ${String(realtimeErr)}`,
      );
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
          updatedAt: this.getNowIso(),
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
            updatedAt: this.getNowIso(),
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
        .set({ status: USER_STATUS.INACTIVE, updatedAt: this.getNowIso() })
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
            updatedAt: this.getNowIso(),
          })
          .where(eq(staffProfiles.id, staff.id));

        // 5. If clinical, disable practitioner appointments
        await this.db
          .update(practitioners)
          .set({
            isAcceptingAppointments: false,
            updatedAt: this.getNowIso(),
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

    try {
      const realtimePayload = {
        invitationId: id,
        email: existing.email,
        status: STAFF_INVITATION_STATUS.REVOKED,
        revokedAt: this.getNowIso(),
      };
      void this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'staff:invitation_revoked',
        realtimePayload,
      );
      void this.realtimeGateway?.emitToRole?.(
        'admin',
        'staff:invitation_revoked',
        realtimePayload,
      );
      void this.realtimeGateway?.emitToRole?.(
        'admin',
        'staff:updated',
        realtimePayload,
      );
    } catch (realtimeErr) {
      this.logger.warn(
        `Failed to emit staff:invitation_revoked realtime event: ${String(realtimeErr)}`,
      );
    }

    return updated;
  }
}

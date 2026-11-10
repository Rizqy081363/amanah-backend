import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  authSessions,
  patientProfiles,
  roles,
  session,
  staffProfiles,
  user,
  userRoles,
  users,
} from '../../../../database/schema';
import { RedisService } from '../../../../common/redis/redis.service';
import {
  isAccountBlocked,
  USER_STATUS,
  UserStatus,
} from '../../../../common/constants';
import {
  AUTH_PROVIDER,
  type AuthProvider,
} from '../../../../common/constants/auth-providers.constants';
import {
  UserAffiliationSummary,
  UserDirectoryEntity,
  UserListPaginatedResult,
  UserRoleSummary,
} from '../../domain/entities/user-directory.entity';
import {
  BatchCreateUserInput,
  BatchUpdateUserInput,
  BulkPurgeResult,
  BulkStatusResult,
  IUserManagementRepository,
  QueryUsersParams,
  UpdateUserRepoInput,
} from '../../domain/repositories/user-management.repository.interface';

@Injectable()
export class UserManagementDrizzleRepository
  implements IUserManagementRepository
{
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
  ) {}

  private mapUserRecordToEntity(rec: any): UserDirectoryEntity {
    const activeRoles: UserRoleSummary[] = (rec.userRoles_userId || [])
      .filter((ur: any) => ur.role && ur.role.isActive)
      .map((ur: any) => ({
        id: ur.role.id,
        code: ur.role.code,
        name: ur.role.name,
        audience: ur.role.audience,
        isSystem: ur.role.isSystem,
        isActive: ur.role.isActive,
        isClinical: ur.role.isClinical,
      }));

    const primaryRole = activeRoles[0] ?? null;
    const primaryAudience = primaryRole?.audience ?? 'internal';
    const staffProfileRec = rec.staffProfiles?.[0];
    const staffProfile = staffProfileRec
      ? {
          id: staffProfileRec.id,
          staffCode: staffProfileRec.staffCode,
          fullName: staffProfileRec.fullName,
          phone: staffProfileRec.phone ?? null,
          positionTitle: staffProfileRec.positionTitle,
          departmentName: staffProfileRec.departmentName,
          hiredAt: staffProfileRec.hiredAt,
          birthPlace: staffProfileRec.birthPlace,
          birthDate: staffProfileRec.birthDate,
          gender: staffProfileRec.gender,
          primaryUnitId: staffProfileRec.primaryUnitId,
          primaryUnitName: staffProfileRec.clinicUnit?.name ?? null,
        }
      : null;

    const patientProfileRec = rec.patientProfiles?.[0];
    const patientAddressRec =
      patientProfileRec?.patientAddresses?.find((a: any) => a.isPrimary) ||
      patientProfileRec?.patientAddresses?.[0];
    const patientEmergencyRec = patientProfileRec?.patientEmergencyContacts?.[0];

    const patientProfile = patientProfileRec
      ? {
          id: patientProfileRec.id,
          medicalRecordNumber: patientProfileRec.medicalRecordNumber,
          fullName: patientProfileRec.fullName,
          phone: patientProfileRec.phone ?? null,
          motherName: patientProfileRec.motherName,
          birthPlace: patientProfileRec.birthPlace,
          birthDate: patientProfileRec.birthDate,
          gender: patientProfileRec.gender,
          bloodType: patientProfileRec.bloodType?.name ?? null,
          bloodTypeId: patientProfileRec.bloodTypeId ?? null,
          bloodTypeCode: patientProfileRec.bloodType?.code ?? null,
          occupation: patientProfileRec.occupation?.name ?? patientProfileRec.occupation ?? null,
          occupationId: patientProfileRec.occupationId ?? null,
          visitCount: patientProfileRec.visitCount ?? 0,
          lastVisitAt: patientProfileRec.lastVisitAt,
          address: patientAddressRec
            ? {
                fullAddress: patientAddressRec.fullAddress || patientAddressRec.line1,
                provinceName: patientAddressRec.provinceName ?? null,
                regencyName: patientAddressRec.regencyName ?? null,
                districtName: patientAddressRec.districtName ?? null,
                villageName: patientAddressRec.villageName ?? null,
              }
            : null,
          emergencyContact: patientEmergencyRec
            ? {
                name: patientEmergencyRec.name,
                relationship: patientEmergencyRec.relationship ?? null,
                phone: patientEmergencyRec.phone,
              }
            : null,
        }
      : null;

    const affiliations: UserAffiliationSummary[] = (rec.patientAffiliations || [])
      .filter((aff: any) => aff.patientProfile)
      .map((aff: any) => ({
        id: aff.id,
        patientId: aff.patientProfile.id,
        fullName: aff.patientProfile.fullName,
        medicalRecordNumber: aff.patientProfile.medicalRecordNumber,
        relationshipName: aff.relationshipType?.name || aff.relationLabel || 'Anggota Keluarga',
        relationLabel: aff.relationLabel ?? null,
        isPrimary: aff.isPrimary ?? false,
      }));

    const rawAccounts: Array<{ providerId: string }> = rec.authAccounts ?? [];
    const authProviders: AuthProvider[] = rawAccounts
      .map((acc) => acc.providerId)
      .filter((pid): pid is AuthProvider =>
        pid === AUTH_PROVIDER.GOOGLE || pid === AUTH_PROVIDER.CREDENTIAL,
      );
    const hasGoogle = authProviders.includes(AUTH_PROVIDER.GOOGLE);
    const hasPassword = authProviders.includes(AUTH_PROVIDER.CREDENTIAL);

    const effectivePhone =
      rec.phone ||
      staffProfileRec?.phone ||
      patientProfileRec?.phone ||
      null;

    const effectiveName =
      staffProfileRec?.fullName ||
      patientProfileRec?.fullName ||
      rec.name;

    return {
      id: rec.id,
      name: effectiveName,
      email: rec.email,
      phone: effectivePhone,
      avatarUrl: rec.avatarUrl,
      status: rec.status,
      preferredLocale: rec.preferredLocale ?? 'id-ID',
      emailVerified: rec.emailVerified,
      phoneVerified: rec.phoneVerified,
      twoFactorEnabled: rec.twoFactorEnabled,
      authVersion: rec.authVersion,
      authProviders,
      hasGoogle,
      hasPassword,
      roles: activeRoles,
      primaryRole,
      primaryAudience,
      staffProfileId: staffProfile?.id ?? null,
      staffProfile,
      patientProfileId: patientProfile?.id ?? null,
      patientProfile,
      patientAffiliations: affiliations,
      lastLoginAt: rec.lastLoginAt,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    };
  }

  async findUsers(params: QueryUsersParams): Promise<UserListPaginatedResult> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    // 1. Role-agnostic search on name, email, and phone across the whole database
    if (params.search && params.search.trim().length > 0) {
      const term = `%${params.search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          ilike(users.name, term),
          ilike(users.email, term),
          ilike(users.phone, term),
        ),
      );
    }

    // 2. Filter by status
    if (params.status && params.status !== 'all') {
      conditions.push(eq(users.status, params.status as any));
    }

    // 3. Filter by role ID
    if (params.roleId && params.roleId !== 'all') {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = ${users.id}
            AND ur.role_id = ${params.roleId}::uuid
            AND ur.revoked_at IS NULL
        )`,
      );
    }

    // 4. Filter by audience
    if (params.audience && params.audience !== 'all') {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = ${users.id}
            AND r.audience = ${params.audience}
            AND ur.revoked_at IS NULL
        )`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Server-side total count query
    const [countResult] = await this.db
      .select({ total: count() })
      .from(users)
      .where(whereClause);
    const total = Number(countResult?.total || 0);

    // Sorting
    let orderByClause: any[] = [desc(users.createdAt), desc(users.id)];
    if (params.sort) {
      const [col, direction] = params.sort.split(':');
      const isDesc = direction?.toLowerCase() === 'desc';
      if (col === 'name') {
        orderByClause = [isDesc ? desc(users.name) : asc(users.name)];
      } else if (col === 'email') {
        orderByClause = [isDesc ? desc(users.email) : asc(users.email)];
      } else if (col === 'status') {
        orderByClause = [isDesc ? desc(users.status) : asc(users.status)];
      } else if (col === 'createdAt') {
        orderByClause = [isDesc ? desc(users.createdAt) : asc(users.createdAt)];
      }
    }

    const records = await this.db.query.users.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: orderByClause,
      with: {
        userRoles_userId: {
          where: sql`revoked_at IS NULL`,
          with: {
            role: true,
          },
        },
        staffProfiles: {
          with: {
            clinicUnit: true,
          },
        },
        patientProfiles: {
          with: {
            bloodType: true,
            occupation: true,
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
        patientAffiliations: {
          with: {
            patientProfile: true,
            relationshipType: true,
          },
        },
        authAccounts: {
          columns: {
            providerId: true,
          },
        },
      },
    });

    return {
      users: records.map((r) => this.mapUserRecordToEntity(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findById(id: string): Promise<UserDirectoryEntity | null> {
    const record = await this.db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        userRoles_userId: {
          where: sql`revoked_at IS NULL`,
          with: {
            role: true,
          },
        },
        staffProfiles: {
          with: {
            clinicUnit: true,
          },
        },
        patientProfiles: {
          with: {
            bloodType: true,
            occupation: true,
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
        patientAffiliations: {
          with: {
            patientProfile: true,
            relationshipType: true,
          },
        },
        authAccounts: {
          columns: {
            providerId: true,
          },
        },
      },
    });

    if (!record) return null;
    return this.mapUserRecordToEntity(record);
  }

  async findByEmail(email: string): Promise<UserDirectoryEntity | null> {
    const record = await this.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase().trim()),
      with: {
        userRoles_userId: {
          where: sql`revoked_at IS NULL`,
          with: {
            role: true,
          },
        },
        staffProfiles: {
          with: {
            clinicUnit: true,
          },
        },
        patientProfiles: {
          with: {
            bloodType: true,
            occupation: true,
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
        patientAffiliations: {
          with: {
            patientProfile: true,
            relationshipType: true,
          },
        },
        authAccounts: {
          columns: {
            providerId: true,
          },
        },
      },
    });

    if (!record) return null;
    return this.mapUserRecordToEntity(record);
  }

  async getAllUsersForExport(): Promise<UserDirectoryEntity[]> {
    const records = await this.db.query.users.findMany({
      orderBy: [asc(users.name), asc(users.id)],
      with: {
        userRoles_userId: {
          where: sql`revoked_at IS NULL`,
          with: {
            role: true,
          },
        },
        staffProfiles: {
          with: {
            clinicUnit: true,
          },
        },
        patientProfiles: {
          with: {
            bloodType: true,
            occupation: true,
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
        patientAffiliations: {
          with: {
            patientProfile: true,
            relationshipType: true,
          },
        },
        authAccounts: {
          columns: {
            providerId: true,
          },
        },
      },
    });

    return records.map((r) => this.mapUserRecordToEntity(r));
  }

  async countActiveAdmins(excludeUserId?: string): Promise<number> {
    const conditions = [
      eq(roles.isSystem, true),
      eq(roles.isActive, true),
      eq(users.status, USER_STATUS.ACTIVE),
      sql`ur.revoked_at IS NULL`,
    ];

    if (excludeUserId) {
      conditions.push(sql`u.id != ${excludeUserId}::uuid`);
    }

    const result = await this.db.execute(sql`
      SELECT count(DISTINCT u.id) as total
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.is_system = true
        AND r.is_active = true
        AND u.status = 'active'
        AND ur.revoked_at IS NULL
        ${excludeUserId ? sql`AND u.id != ${excludeUserId}::uuid` : sql``}
    `);

    const rows = (result as any)?.rows ?? (result as any) ?? [];
    return Number(rows[0]?.total || 0);
  }

  async getAllActiveRoles(): Promise<UserRoleSummary[]> {
    const activeRoles = await this.db.query.roles.findMany({
      where: and(eq(roles.isActive, true), eq(roles.isSystem, false)),
      orderBy: [asc(roles.audience), asc(roles.name)],
    });

    return activeRoles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      audience: r.audience,
      isSystem: r.isSystem,
      isActive: r.isActive,
      isClinical: r.isClinical,
    }));
  }

  async updateUser(
    id: string,
    input: UpdateUserRepoInput,
    actorAdminId: string,
  ): Promise<UserDirectoryEntity> {
    const existing = await this.db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        userRoles_userId: {
          where: sql`revoked_at IS NULL`,
          with: { role: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Pengguna dengan ID "${id}" tidak ditemukan.`,
      );
    }

    // Guard 1: Self-deactivation prevention
    if (input.status && isAccountBlocked(input.status) && id === actorAdminId) {
      throw new ForbiddenException(
        'Tindakan ditolak: Administrator tidak dapat menonaktifkan akun sendiri.',
      );
    }

    // Guard 2: Last admin defense & system role assignment barrier
    const isCurrentAdmin = (existing.userRoles_userId || []).some(
      (ur: any) => ur.role?.isSystem === true,
    );

    if (isCurrentAdmin) {
      const willBeBlocked = input.status && isAccountBlocked(input.status);
      let willLoseAdminRole = false;

      if (input.roleIds !== undefined) {
        const activeAdminRole = await this.db.query.roles.findFirst({
          where: and(eq(roles.isSystem, true), eq(roles.isActive, true)),
        });
        if (activeAdminRole && !input.roleIds.includes(activeAdminRole.id)) {
          willLoseAdminRole = true;
        }
      }

      if (willBeBlocked || willLoseAdminRole) {
        const remainingAdmins = await this.countActiveAdmins(id);
        if (remainingAdmins < 1) {
          throw new ForbiddenException(
            'Tindakan ditolak: Tidak dapat mencabut peran atau menonaktifkan akun administrator aktif terakhir di sistem.',
          );
        }
      }
    }

    // Guard 3: Reject assigning system roles via operational user update
    if (input.roleIds !== undefined && input.roleIds.length > 0) {
      const assignedRoles = await this.db.query.roles.findMany({
        where: inArray(roles.id, input.roleIds),
      });
      const existingSystemRoleIds = new Set(
        (existing.userRoles_userId || [])
          .filter((ur: any) => ur.role?.isSystem === true)
          .map((ur: any) => ur.roleId),
      );
      for (const r of assignedRoles) {
        if (r.isSystem && !existingSystemRoleIds.has(r.id)) {
          throw new ForbiddenException(
            'Peran administrator sistem tidak dapat diberikan melalui alur pembaruan pengguna operasional.',
          );
        }
      }
    }

    // Security Invariant: Administrator cannot change an existing user's account email.
    // The account email is owned by the user and preserved as existing.email.
    const preservedEmail = existing.email;

    const nowStr = new Date().toISOString();
    const isBlocking = input.status ? isAccountBlocked(input.status) : false;

    await this.db.transaction(async (tx) => {
      // 1. Update users table
      const userUpdate: Record<string, unknown> = {
        name: input.name,
        email: preservedEmail,
        updatedAt: nowStr,
        authVersion: sql`auth_version + 1`,
      };
      if (input.phone !== undefined) {
        userUpdate.phone = input.phone;
        await tx
          .update(staffProfiles)
          .set({ phone: input.phone, updatedAt: nowStr })
          .where(eq(staffProfiles.userId, id));
        await tx
          .update(patientProfiles)
          .set({ phone: input.phone, updatedAt: nowStr })
          .where(eq(patientProfiles.userId, id));
      }
      if (input.status) userUpdate.status = input.status;
      if (input.preferredLocale)
        userUpdate.preferredLocale = input.preferredLocale;

      await tx.update(users).set(userUpdate).where(eq(users.id, id));

      // 2. Update Better-Auth user table
      const betterAuthUpdate: Record<string, unknown> = {
        name: input.name,
        email: preservedEmail,
        updatedAt: nowStr,
      };
      if (input.status) {
        betterAuthUpdate.banned = isBlocking;
        betterAuthUpdate.banReason = isBlocking
          ? 'Akun dinonaktifkan oleh administrator sistem.'
          : null;
      }
      await tx.update(user).set(betterAuthUpdate).where(eq(user.id, id));

      // 3. Synchronize user_roles if roleIds provided
      if (input.roleIds !== undefined) {
        const desiredRoleIds = new Set(input.roleIds);

        const allUserRoles = await tx
          .select()
          .from(userRoles)
          .where(eq(userRoles.userId, id));

        // Revoke active roles that are not in desiredRoleIds
        for (const ur of allUserRoles) {
          if (!ur.revokedAt && !desiredRoleIds.has(ur.roleId)) {
            await tx
              .update(userRoles)
              .set({ revokedAt: nowStr, updatedAt: nowStr })
              .where(eq(userRoles.id, ur.id));
          }
        }

        // Add or restore desired roles
        for (const roleId of desiredRoleIds) {
          const existingRow = allUserRoles.find((ur) => ur.roleId === roleId);
          if (existingRow) {
            if (existingRow.revokedAt) {
              await tx
                .update(userRoles)
                .set({
                  revokedAt: null,
                  assignedAt: nowStr,
                  assignedBy: actorAdminId,
                  updatedAt: nowStr,
                })
                .where(eq(userRoles.id, existingRow.id));
            }
          } else {
            await tx.insert(userRoles).values({
              userId: id,
              roleId,
              assignedBy: actorAdminId,
              assignedAt: nowStr,
              createdAt: nowStr,
              updatedAt: nowStr,
            });
          }
        }
      }
    });

    // 4. Redis cache eviction & session invalidation
    await this.redisService.purgeUserData(id, existing.email);

    const updated = await this.findById(id);
    if (!updated) {
      throw new NotFoundException(
        `Pengguna dengan ID "${id}" tidak ditemukan setelah pembaruan.`,
      );
    }
    return updated;
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    actorAdminId: string,
  ): Promise<void> {
    if (id === actorAdminId && isAccountBlocked(status)) {
      throw new ForbiddenException(
        'Tindakan ditolak: Administrator tidak dapat menonaktifkan akun sendiri.',
      );
    }

    if (isAccountBlocked(status)) {
      const remainingAdmins = await this.countActiveAdmins(id);
      if (remainingAdmins < 1) {
        throw new ForbiddenException(
          'Tindakan ditolak: Tidak dapat menonaktifkan akun administrator aktif terakhir di sistem.',
        );
      }
    }

    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    if (!existingUser) {
      throw new NotFoundException(
        `Pengguna dengan ID "${id}" tidak ditemukan.`,
      );
    }

    const isBlocking = isAccountBlocked(status);

    await this.db.transaction(async (tx) => {
      // 1. Update status and increment auth_version
      await tx
        .update(users)
        .set({
          status,
          authVersion: sql`auth_version + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, id));

      // 2. Synchronize Better-Auth user status
      await tx
        .update(user)
        .set({
          banned: isBlocking,
          banReason: isBlocking
            ? 'Akun dinonaktifkan oleh administrator sistem.'
            : null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(user.id, id));

      // 3. If blocking, revoke all active sessions immediately
      if (isBlocking) {
        await tx.delete(session).where(eq(session.userId, id));
        await tx.delete(authSessions).where(eq(authSessions.userId, id));
      }
    });

    // 4. Invalidate Redis token cache
    await this.redisService.purgeUserData(id, existingUser.email);
  }

  async bulkUpdateStatus(
    ids: string[],
    status: UserStatus,
    actorAdminId: string,
  ): Promise<BulkStatusResult> {
    const cleanIds = Array.from(new Set(ids.filter(Boolean)));
    if (cleanIds.length === 0) {
      return { affectedCount: 0, skippedCount: 0, skippedReasons: [] };
    }

    const skippedReasons: string[] = [];
    const eligibleIds: string[] = [];
    const isBlocking = isAccountBlocked(status);

    for (const targetId of cleanIds) {
      if (targetId === actorAdminId && isBlocking) {
        skippedReasons.push(
          `ID ${targetId}: Tidak dapat menonaktifkan akun sendiri.`,
        );
        continue;
      }
      eligibleIds.push(targetId);
    }

    if (isBlocking && eligibleIds.length > 0) {
      const remainingAdmins = await this.countActiveAdmins();
      // Check how many admins are in the eligible targets
      const targetsWithAdmin = await this.db.execute(sql`
        SELECT DISTINCT u.id
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles r ON ur.role_id = r.id
        WHERE r.code = 'admin'
          AND ur.revoked_at IS NULL
          AND u.id IN (${sql.join(
            eligibleIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
      `);

      const adminRows =
        (targetsWithAdmin as any)?.rows ?? (targetsWithAdmin as any) ?? [];
      const adminCountInBatch = adminRows.length;
      if (remainingAdmins - adminCountInBatch < 1) {
        throw new ForbiddenException(
          'Operasi massal dibatalkan: Operasi ini akan menonaktifkan seluruh administrator sistem yang tersisa.',
        );
      }
    }

    if (eligibleIds.length === 0) {
      return {
        affectedCount: 0,
        skippedCount: cleanIds.length,
        skippedReasons,
      };
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status,
          authVersion: sql`auth_version + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(
          inArray(
            users.id,
            eligibleIds.map((id) => id),
          ),
        );

      await tx
        .update(user)
        .set({
          banned: isBlocking,
          banReason: isBlocking
            ? 'Akun dinonaktifkan secara massal oleh administrator.'
            : null,
          updatedAt: new Date().toISOString(),
        })
        .where(
          inArray(
            user.id,
            eligibleIds.map((id) => id),
          ),
        );

      if (isBlocking) {
        await tx.delete(session).where(
          inArray(
            session.userId,
            eligibleIds.map((id) => id),
          ),
        );
        await tx.delete(authSessions).where(
          inArray(
            authSessions.userId,
            eligibleIds.map((id) => id),
          ),
        );
      }
    });

    for (const uid of eligibleIds) {
      await this.redisService.purgeUserData(uid);
    }

    return {
      affectedCount: eligibleIds.length,
      skippedCount: cleanIds.length - eligibleIds.length,
      skippedReasons,
    };
  }

  async purgeUser(
    id: string,
    actorAdminId: string,
  ): Promise<{ success: boolean; details: any }> {
    if (id === actorAdminId) {
      throw new ForbiddenException(
        'Tindakan ditolak: Administrator tidak dapat menghapus permanen akun sendiri.',
      );
    }

    const remainingAdmins = await this.countActiveAdmins(id);
    if (remainingAdmins < 1) {
      throw new ForbiddenException(
        'Tindakan ditolak: Tidak dapat menghapus akun administrator aktif terakhir di sistem.',
      );
    }

    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
    if (!existingUser) {
      throw new NotFoundException(
        `Pengguna dengan ID "${id}" tidak ditemukan.`,
      );
    }

    const email = existingUser.email;

    // Execute canonical stored procedure purge_user_systemic
    const result = await this.db.execute(
      sql`SELECT public.purge_user_systemic(${id}) as res`,
    );

    const rows = (result as any)?.rows ?? (result as any) ?? [];
    const details = rows[0]?.res;

    // Purge user cache
    await this.redisService.purgeUserData(id, email);

    return {
      success: true,
      details,
    };
  }

  async bulkPurgeUsers(
    ids: string[],
    actorAdminId: string,
  ): Promise<BulkPurgeResult> {
    const cleanIds = Array.from(new Set(ids.filter(Boolean)));
    const details: { id: string; status: string; reason?: string }[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const targetId of cleanIds) {
      if (targetId === actorAdminId) {
        failureCount++;
        details.push({
          id: targetId,
          status: 'skipped',
          reason: 'Tidak dapat menghapus akun sendiri.',
        });
        continue;
      }

      try {
        const remainingAdmins = await this.countActiveAdmins(targetId);
        if (remainingAdmins < 1) {
          failureCount++;
          details.push({
            id: targetId,
            status: 'skipped',
            reason: 'Merupakan administrator aktif terakhir di sistem.',
          });
          continue;
        }

        const purgeRes = await this.purgeUser(targetId, actorAdminId);
        if (purgeRes.success) {
          successCount++;
          details.push({ id: targetId, status: 'purged' });
        }
      } catch (err: any) {
        failureCount++;
        details.push({
          id: targetId,
          status: 'error',
          reason: err?.message || 'Gagal menghapus pengguna.',
        });
      }
    }

    return {
      successCount,
      failureCount,
      details,
    };
  }

  async getActiveRolesMap(): Promise<Map<string, string>> {
    const activeRoles = await this.db.query.roles.findMany({
      where: eq(roles.isActive, true),
    });

    const map = new Map<string, string>();
    for (const r of activeRoles) {
      map.set(r.code, r.id);
    }
    return map;
  }

  async getAllUserEmails(): Promise<Set<string>> {
    const records = await this.db.select({ email: users.email }).from(users);

    const set = new Set<string>();
    for (const r of records) {
      if (r.email) set.add(r.email.toLowerCase().trim());
    }
    return set;
  }

  async batchCreateUsers(
    records: BatchCreateUserInput[],
    actorAdminId: string,
  ): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const rec of records) {
      try {
        const [insertedUser] = await this.db
          .insert(users)
          .values({
            name: rec.name,
            email: rec.email.toLowerCase().trim() as any,
            phone: rec.phone ?? null,
            status: rec.status,
            emailVerified: true,
          })
          .onConflictDoNothing()
          .returning({ id: users.id });

        if (!insertedUser) {
          skipped++;
          continue;
        }

        // Insert into Better-Auth user table to maintain parity
        await this.db
          .insert(user)
          .values({
            id: insertedUser.id as any,
            name: rec.name,
            email: rec.email.toLowerCase().trim(),
            emailVerified: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any)
          .onConflictDoNothing();

        // Assign roles
        if (rec.roleIds.length > 0) {
          for (const roleId of rec.roleIds) {
            await this.db
              .insert(userRoles)
              .values({
                userId: insertedUser.id,
                roleId,
                assignedBy: actorAdminId,
              })
              .onConflictDoNothing();
          }
        }

        created++;
      } catch {
        skipped++;
      }
    }

    return { created, skipped };
  }

  async batchUpdateUsers(records: BatchUpdateUserInput[]): Promise<number> {
    let updated = 0;
    for (const rec of records) {
      const emailLower = rec.email.toLowerCase().trim();
      const updateData: any = { updatedAt: new Date().toISOString() };
      if (rec.name) updateData.name = rec.name;
      if (rec.phone !== undefined) updateData.phone = rec.phone;

      const res = await this.db
        .update(users)
        .set(updateData)
        .where(eq(users.email, emailLower as any))
        .returning({ id: users.id });

      if (res.length > 0) {
        if (rec.name) {
          await this.db
            .update(user)
            .set({ name: rec.name, updatedAt: new Date().toISOString() })
            .where(eq(user.id, res[0].id));
        }
        updated++;
      }
    }
    return updated;
  }
}

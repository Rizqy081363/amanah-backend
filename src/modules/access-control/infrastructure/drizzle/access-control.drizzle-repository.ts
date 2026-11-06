import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { CanonicalSlugHelper } from '@common/utils';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  applicationPages,
  permissions,
  rolePageAccess,
  rolePermissions,
  roles,
  staffProfiles,
  userRoles,
  users,
} from '../../../../database/schema/amanah.schema';
import {
  AccessControlRepository,
  CreateRoleInput,
  UpdateRoleInput,
} from '../../domain/repositories/access-control.repository.interface';
import {
  RoleAudience,
  RoleEntity,
  RoleTier,
} from '../../domain/entities/role.entity';
import { ApplicationPageEntity } from '../../domain/entities/application-page.entity';
import { DEFAULT_ROLE_AUDIENCE } from '../../../../common/constants/role-audience.constants';
import { PermissionEntity } from '../../domain/entities/permission.entity';

@Injectable()
export class AccessControlDrizzleRepository implements AccessControlRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async findAllRoles(): Promise<RoleEntity[]> {
    const allRoles = await this.db.query.roles.findMany({
      orderBy: [asc(roles.tier), asc(roles.name)],
      with: {
        rolePermissions: {
          with: {
            permission: true,
          },
        },
        parentRole: true,
      },
    });

    const userRoleCounts = await this.db
      .select({
        roleId: sql<string>`sub.role_id`,
        count: sql<number>`count(DISTINCT sub.user_id)::int`,
      })
      .from(
        sql`(
          SELECT role_id, user_id FROM user_roles WHERE revoked_at IS NULL
          UNION
          SELECT role_id, user_id FROM staff_profiles WHERE role_id IS NOT NULL AND user_id IS NOT NULL
        ) as sub`,
      )
      .groupBy(sql`sub.role_id`);

    const userCountMap = new Map<string, number>();
    for (const uc of userRoleCounts) {
      if (uc.roleId) {
        userCountMap.set(uc.roleId, uc.count);
      }
    }

    const roleMap = new Map<string, (typeof allRoles)[0]>();
    for (const r of allRoles) {
      roleMap.set(r.id, r);
    }

    return allRoles.map((r) => {
      const directPermissions = (r.rolePermissions || [])
        .map((rp) => rp.permission)
        .filter((p): p is typeof permissions.$inferSelect => Boolean(p));

      // Resolve effective permissions (direct + inherited from parent)
      const effectivePermSet = new Set<string>();
      for (const p of directPermissions) {
        effectivePermSet.add(p.code);
      }

      let currentParentId = r.parentRoleId;
      while (currentParentId && roleMap.has(currentParentId)) {
        const parent = roleMap.get(currentParentId)!;
        const parentPerms = (parent.rolePermissions || [])
          .map((rp) => rp.permission)
          .filter((p): p is typeof permissions.$inferSelect => Boolean(p));
        for (const pp of parentPerms) {
          effectivePermSet.add(pp.code);
        }
        currentParentId = parent.parentRoleId;
      }

      return {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        parentRoleId: r.parentRoleId,
        tier: r.tier as RoleTier,
        audience: (r.audience as RoleAudience) || DEFAULT_ROLE_AUDIENCE,
        isClinical: r.isClinical,
        isActive: r.isActive,
        isDefault: r.isDefault,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        parentRole: r.parentRole
          ? {
              id: r.parentRole.id,
              code: r.parentRole.code,
              name: r.parentRole.name,
              description: r.parentRole.description,
              isSystem: r.parentRole.isSystem,
              parentRoleId: r.parentRole.parentRoleId,
              tier: r.parentRole.tier as RoleTier,
              audience:
                (r.parentRole.audience as RoleAudience) ||
                DEFAULT_ROLE_AUDIENCE,
              isClinical: r.parentRole.isClinical,
              isActive: r.parentRole.isActive,
              isDefault: r.parentRole.isDefault,
              createdAt: r.parentRole.createdAt,
              updatedAt: r.parentRole.updatedAt,
            }
          : null,
        permissions: directPermissions.map((p) => ({
          id: p.id,
          code: p.code,
          description: p.description,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        effectivePermissionCodes: Array.from(effectivePermSet),
        userCount: userCountMap.get(r.id) ?? 0,
        staffCount: userCountMap.get(r.id) ?? 0,
      };
    });
  }

  async findRoleById(id: string): Promise<RoleEntity | null> {
    const roleRecord = await this.db.query.roles.findFirst({
      where: eq(roles.id, id),
      with: {
        rolePermissions: {
          with: {
            permission: true,
          },
        },
        parentRole: true,
      },
    });

    if (!roleRecord) {
      return null;
    }

    const directPermissions = (roleRecord.rolePermissions || [])
      .map((rp) => rp.permission)
      .filter((p): p is typeof permissions.$inferSelect => Boolean(p));

    const effectivePermSet = new Set<string>();
    for (const p of directPermissions) {
      effectivePermSet.add(p.code);
    }

    let currentParentId = roleRecord.parentRoleId;
    while (currentParentId) {
      const parent = await this.db.query.roles.findFirst({
        where: eq(roles.id, currentParentId),
        with: {
          rolePermissions: {
            with: {
              permission: true,
            },
          },
        },
      });
      if (!parent) break;
      const parentPerms = (parent.rolePermissions || [])
        .map((rp) => rp.permission)
        .filter((p): p is typeof permissions.$inferSelect => Boolean(p));
      for (const pp of parentPerms) {
        effectivePermSet.add(pp.code);
      }
      currentParentId = parent.parentRoleId;
    }

    const [userCountRes] = await this.db
      .select({
        count: sql<number>`count(DISTINCT sub.user_id)::int`,
      })
      .from(
        sql`(
          SELECT user_id FROM user_roles WHERE role_id = ${id} AND revoked_at IS NULL
          UNION
          SELECT user_id FROM staff_profiles WHERE role_id = ${id} AND user_id IS NOT NULL
        ) as sub`,
      );
    const userCount = userCountRes?.count ?? 0;

    return {
      id: roleRecord.id,
      code: roleRecord.code,
      name: roleRecord.name,
      description: roleRecord.description,
      isSystem: roleRecord.isSystem,
      parentRoleId: roleRecord.parentRoleId,
      tier: roleRecord.tier as RoleTier,
      audience: (roleRecord.audience as RoleAudience) || DEFAULT_ROLE_AUDIENCE,
      isClinical: roleRecord.isClinical,
      isActive: roleRecord.isActive,
      isDefault: roleRecord.isDefault,
      createdAt: roleRecord.createdAt,
      updatedAt: roleRecord.updatedAt,
      parentRole: roleRecord.parentRole
        ? {
            id: roleRecord.parentRole.id,
            code: roleRecord.parentRole.code,
            name: roleRecord.parentRole.name,
            description: roleRecord.parentRole.description,
            isSystem: roleRecord.parentRole.isSystem,
            parentRoleId: roleRecord.parentRole.parentRoleId,
            tier: roleRecord.parentRole.tier as RoleTier,
            audience:
              (roleRecord.parentRole.audience as RoleAudience) ||
              DEFAULT_ROLE_AUDIENCE,
            isClinical: roleRecord.parentRole.isClinical,
            isActive: roleRecord.parentRole.isActive,
            isDefault: roleRecord.parentRole.isDefault,
            createdAt: roleRecord.parentRole.createdAt,
            updatedAt: roleRecord.parentRole.updatedAt,
          }
        : null,
      permissions: directPermissions.map((p) => ({
        id: p.id,
        code: p.code,
        description: p.description,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      effectivePermissionCodes: Array.from(effectivePermSet),
      userCount,
      staffCount: userCount,
    };
  }

  async findRoleByCode(code: string): Promise<RoleEntity | null> {
    const roleRecord = await this.db.query.roles.findFirst({
      where: eq(roles.code, code),
    });
    if (!roleRecord) return null;
    return this.findRoleById(roleRecord.id);
  }

  async createRole(data: CreateRoleInput): Promise<RoleEntity> {
    const rawCode = data.code?.trim();
    let finalCode: string;

    if (rawCode) {
      const existing = await this.db.query.roles.findFirst({
        where: eq(roles.code, rawCode),
      });
      if (existing) {
        throw new BadRequestException(
          `Peran dengan kode '${rawCode}' sudah terdaftar`,
        );
      }
      finalCode = rawCode;
    } else {
      const baseCode = CanonicalSlugHelper.toSnakeCase(data.name, 'role');
      finalCode = baseCode;
      let counter = 1;
      while (
        await this.db.query.roles.findFirst({
          where: eq(roles.code, finalCode),
        })
      ) {
        finalCode = `${baseCode}_${counter++}`;
      }
    }

    let audience: RoleAudience =
      (data.audience as RoleAudience) || DEFAULT_ROLE_AUDIENCE;
    let isClinical = Boolean(data.isClinical);
    if (data.parentRoleId) {
      const parent = await this.db.query.roles.findFirst({
        where: eq(roles.id, data.parentRoleId),
      });
      if (!parent) {
        throw new NotFoundException(
          'Peran induk (parent role) tidak ditemukan',
        );
      }
      if (data.audience === undefined && parent.audience) {
        audience = parent.audience as RoleAudience;
      }
      if (data.isClinical === undefined) {
        isClinical = parent.isClinical;
      }
    }

    if (data.isDefault) {
      await this.db
        .update(roles)
        .set({ isDefault: false })
        .where(eq(roles.audience, audience));
    }

    const [inserted] = await this.db
      .insert(roles)
      .values({
        code: finalCode,
        name: data.name,
        description: data.description || null,
        parentRoleId: data.parentRoleId || null,
        tier: data.tier || (data.parentRoleId ? 'micro' : 'macro'),
        audience,
        isClinical,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
        isSystem: false,
      })
      .returning();

    if (data.pageIds && data.pageIds.length > 0) {
      await this.assignPagesToRole(inserted.id, data.pageIds);
    }

    if (data.permissionIds && data.permissionIds.length > 0) {
      await this.assignPermissionsToRole(inserted.id, data.permissionIds);
    } else if (audience === 'external') {
      const defaultExternalPermCodes = [
        'app:access',
        'appointments:book',
        'appointments:manage',
        'appointments:read',
        'chat:read',
        'chat:send',
        'notifications:read',
        'patients:register',
        'profile:read',
        'profile:update',
        'queue:read',
        'records:read',
        'schedules:read',
      ];
      const defaultPerms = await this.db.query.permissions.findMany({
        where: inArray(permissions.code, defaultExternalPermCodes),
      });
      if (defaultPerms.length > 0) {
        await this.assignPermissionsToRole(
          inserted.id,
          defaultPerms.map((p) => p.id),
        );
      }
    }

    const created = await this.findRoleById(inserted.id);
    return created!;
  }

  async updateRole(id: string, data: UpdateRoleInput): Promise<RoleEntity> {
    const existing = await this.db.query.roles.findFirst({
      where: eq(roles.id, id),
    });
    if (!existing) {
      throw new NotFoundException('Peran tidak ditemukan');
    }

    if (data.parentRoleId && data.parentRoleId === id) {
      throw new BadRequestException(
        'Sebuah peran tidak dapat menjadi induk bagi dirinya sendiri',
      );
    }

    // Prevent cycle in hierarchy
    if (data.parentRoleId) {
      let checkId: string | null = data.parentRoleId;
      while (checkId) {
        if (checkId === id) {
          throw new BadRequestException(
            'Hierarki peran siklis terdeteksi. Peran anak tidak dapat dijadikan induk',
          );
        }
        const parentRow: { parentRoleId: string | null } | undefined =
          await this.db.query.roles.findFirst({
            where: eq(roles.id, checkId),
          });
        checkId = parentRow?.parentRoleId || null;
      }
    }

    // Administrative Lockout Prevention:
    // If deactivating a role, ensure that at least one other active user retains the 'roles:manage' permission.
    if (data.isActive === false && existing.isActive === true) {
      const currentRolePerms = await this.getEffectivePermissionsByRoleId(id);
      if (currentRolePerms.includes('roles:manage')) {
        const allRoles = await this.findAllRoles();
        const otherManagerRoleIds = allRoles
          .filter(
            (r) =>
              r.id !== id &&
              r.isActive &&
              r.effectivePermissionCodes?.includes('roles:manage'),
          )
          .map((r) => r.id);

        let otherActiveManagersCount = 0;
        if (otherManagerRoleIds.length > 0) {
          const userRoleManagers = await this.db
            .select({ userId: userRoles.userId })
            .from(userRoles)
            .where(
              and(
                inArray(userRoles.roleId, otherManagerRoleIds),
                isNull(userRoles.revokedAt),
              ),
            );

          const staffManagers = await this.db
            .select({ userId: staffProfiles.userId })
            .from(staffProfiles)
            .where(
              and(
                inArray(staffProfiles.roleId, otherManagerRoleIds),
                isNotNull(staffProfiles.userId),
              ),
            );

          const distinctManagerIds = new Set<string>();
          for (const ur of userRoleManagers) {
            if (ur.userId) distinctManagerIds.add(ur.userId);
          }
          for (const sp of staffManagers) {
            if (sp.userId) distinctManagerIds.add(sp.userId);
          }
          otherActiveManagersCount = distinctManagerIds.size;
        }

        if (otherActiveManagersCount === 0) {
          throw new BadRequestException(
            'Tidak dapat menonaktifkan peran ini karena ini adalah satu-satunya peran aktif yang memiliki hak akses manajemen peran (roles:manage). Tindakan ini dicegah untuk menghindari administrative lockout.',
          );
        }
      }
    }

    if (data.isDefault) {
      const targetAudience =
        (data.audience as RoleAudience) ?? existing.audience;
      await this.db
        .update(roles)
        .set({ isDefault: false })
        .where(eq(roles.audience, targetAudience));
    }

    await this.db
      .update(roles)
      .set({
        name: data.name ?? existing.name,
        description:
          data.description !== undefined
            ? data.description
            : existing.description,
        parentRoleId:
          data.parentRoleId !== undefined
            ? data.parentRoleId
            : existing.parentRoleId,
        tier: data.tier ?? existing.tier,
        audience: (data.audience as RoleAudience) ?? existing.audience,
        isClinical: data.isClinical ?? existing.isClinical,
        isActive: data.isActive ?? existing.isActive,
        isDefault: data.isDefault ?? existing.isDefault,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(roles.id, id));

    // Instant session invalidation if active state toggled
    if (data.isActive !== undefined && data.isActive !== existing.isActive) {
      const userRoleLinks = await this.db.query.userRoles.findMany({
        where: eq(userRoles.roleId, id),
      });
      const userIds = userRoleLinks.map((u) => u.userId);
      if (userIds.length > 0) {
        await this.db
          .update(users)
          .set({ authVersion: sql`auth_version + 1` })
          .where(inArray(users.id, userIds));
      }
    }

    const updated = await this.findRoleById(id);
    return updated!;
  }

  async deleteRole(id: string): Promise<void> {
    const existing = await this.db.query.roles.findFirst({
      where: eq(roles.id, id),
    });
    if (!existing) {
      throw new NotFoundException('Peran tidak ditemukan');
    }

    if (existing.code === 'admin' || existing.code === 'super_admin') {
      throw new BadRequestException(
        'Peran administrator utama sistem tidak dapat dihapus',
      );
    }

    const [staffUsage] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(staffProfiles)
      .where(eq(staffProfiles.roleId, id));

    if (staffUsage && staffUsage.count > 0) {
      throw new BadRequestException(
        `Peran ini masih digunakan oleh ${staffUsage.count} profil staf. Alihkan staf ke peran lain sebelum menghapus`,
      );
    }

    const [childUsage] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(roles)
      .where(eq(roles.parentRoleId, id));

    if (childUsage && childUsage.count > 0) {
      throw new BadRequestException(
        `Peran ini memiliki ${childUsage.count} sub-peran. Hapus atau pindahkan sub-peran terlebih dahulu`,
      );
    }

    await this.db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
    await this.db.delete(userRoles).where(eq(userRoles.roleId, id));
    await this.db.delete(roles).where(eq(roles.id, id));
  }

  async findRoleTree(): Promise<RoleEntity[]> {
    const allRoles = await this.findAllRoles();
    const nodeMap = new Map<string, RoleEntity>();

    for (const r of allRoles) {
      nodeMap.set(r.id, { ...r, children: [] });
    }

    const roots: RoleEntity[] = [];

    for (const r of allRoles) {
      const node = nodeMap.get(r.id)!;
      if (r.parentRoleId && nodeMap.has(r.parentRoleId)) {
        nodeMap.get(r.parentRoleId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findAllPermissions(): Promise<PermissionEntity[]> {
    const all = await this.db
      .select()
      .from(permissions)
      .orderBy(asc(permissions.code));

    return all.map((p) => ({
      id: p.id,
      code: p.code,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  async findPermissionById(id: string): Promise<PermissionEntity | null> {
    const record = await this.db.query.permissions.findFirst({
      where: eq(permissions.id, id),
    });
    if (!record) return null;
    return {
      id: record.id,
      code: record.code,
      description: record.description,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async findPermissionsGrouped(): Promise<Record<string, PermissionEntity[]>> {
    const allPerms = await this.findAllPermissions();
    const grouped: Record<string, PermissionEntity[]> = {};

    for (const p of allPerms) {
      const group = p.code.split(':')[0] || 'general';
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push(p);
    }

    return grouped;
  }

  async addPermissionToRole(
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    const role = await this.db.query.roles.findFirst({
      where: eq(roles.id, roleId),
    });
    if (!role) {
      throw new NotFoundException('Peran tidak ditemukan');
    }

    const perm = await this.db.query.permissions.findFirst({
      where: eq(permissions.id, permissionId),
    });
    if (!perm) {
      throw new NotFoundException('Perizinan tidak ditemukan');
    }

    const existing = await this.db.query.rolePermissions.findFirst({
      where: and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.permissionId, permissionId),
      ),
    });
    if (!existing) {
      await this.db.insert(rolePermissions).values({
        roleId,
        permissionId,
      });
    }
  }

  async removePermissionFromRole(
    roleId: string,
    permissionId: string,
  ): Promise<void> {
    const role = await this.db.query.roles.findFirst({
      where: eq(roles.id, roleId),
    });
    if (!role) {
      throw new NotFoundException('Peran tidak ditemukan');
    }

    await this.db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.permissionId, permissionId),
        ),
      );
  }

  async assignPermissionsToRole(
    roleId: string,
    permissionIds: string[],
  ): Promise<void> {
    const roleExists = await this.db.query.roles.findFirst({
      where: eq(roles.id, roleId),
    });
    if (!roleExists) {
      throw new NotFoundException('Peran tidak ditemukan');
    }

    await this.db
      .delete(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));

    if (permissionIds.length > 0) {
      const validPermissions = await this.db
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.id, permissionIds));

      if (validPermissions.length > 0) {
        await this.db.insert(rolePermissions).values(
          validPermissions.map((vp) => ({
            roleId,
            permissionId: vp.id,
          })),
        );
      }
    }
  }

  async getEffectivePermissionsByRoleId(roleId: string): Promise<string[]> {
    const role = await this.findRoleById(roleId);
    if (!role || !role.isActive) return [];
    if (role.code === 'admin' || role.code === 'super_admin') {
      const allPerms = await this.findAllPermissions();
      return allPerms.map((p) => p.code);
    }
    return role.effectivePermissionCodes || [];
  }

  async getUserEffectivePermissions(userId: string): Promise<string[]> {
    const userRoleRecords = await this.db.query.userRoles.findMany({
      where: and(
        eq(userRoles.userId, userId),
        sql`${userRoles.revokedAt} IS NULL`,
      ),
      with: {
        role: true,
      },
    });

    const staffRecord = await this.db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.userId, userId),
    });

    const distinctRoleIds = new Set<string>();
    for (const ur of userRoleRecords) {
      if (ur.roleId && ur.role?.isActive) distinctRoleIds.add(ur.roleId);
    }
    if (staffRecord?.roleId) {
      const staffRole = await this.findRoleById(staffRecord.roleId);
      if (staffRole?.isActive) {
        distinctRoleIds.add(staffRecord.roleId);
      }
    }

    const effectiveSet = new Set<string>();
    for (const rId of distinctRoleIds) {
      const perms = await this.getEffectivePermissionsByRoleId(rId);
      for (const p of perms) {
        effectiveSet.add(p);
      }
    }

    return Array.from(effectiveSet);
  }

  async findAllPages(): Promise<ApplicationPageEntity[]> {
    const records = await this.db.query.applicationPages.findMany({
      orderBy: [
        asc(applicationPages.audience),
        asc(applicationPages.displayOrder),
      ],
    });

    const pageMap = new Map<string, (typeof records)[0]>();
    for (const p of records) {
      pageMap.set(p.id, p);
    }

    return records.map((p) => {
      let effectiveEnabled = p.isEnabled;
      let currentParentId = p.parentPageId;
      while (currentParentId && pageMap.has(currentParentId)) {
        const parent = pageMap.get(currentParentId)!;
        if (!parent.isEnabled) {
          effectiveEnabled = false;
          break;
        }
        currentParentId = parent.parentPageId;
      }

      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        routePath: p.routePath,
        parentPageId: p.parentPageId,
        audience: p.audience as RoleAudience,
        isEnabled: p.isEnabled,
        icon: p.icon,
        displayOrder: p.displayOrder,
        isSystem: p.isSystem,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        effectiveEnabled,
      };
    });
  }

  async findPageTree(
    audience?: RoleAudience,
  ): Promise<ApplicationPageEntity[]> {
    const all = await this.findAllPages();
    const filtered = audience
      ? all.filter((p) => p.audience === audience)
      : all;

    const parents = filtered.filter((p) => !p.parentPageId);
    const childMap = new Map<string, ApplicationPageEntity[]>();
    for (const p of filtered) {
      if (p.parentPageId) {
        if (!childMap.has(p.parentPageId)) {
          childMap.set(p.parentPageId, []);
        }
        childMap.get(p.parentPageId)!.push(p);
      }
    }

    for (const parent of parents) {
      parent.children = childMap.get(parent.id) || [];
    }

    return parents;
  }

  async findPageById(id: string): Promise<ApplicationPageEntity | null> {
    const p = await this.db.query.applicationPages.findFirst({
      where: eq(applicationPages.id, id),
    });
    if (!p) return null;

    let effectiveEnabled = p.isEnabled;
    let currentParentId = p.parentPageId;
    while (currentParentId) {
      const parent = await this.db.query.applicationPages.findFirst({
        where: eq(applicationPages.id, currentParentId),
      });
      if (!parent || !parent.isEnabled) {
        effectiveEnabled = false;
        break;
      }
      currentParentId = parent.parentPageId;
    }

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      routePath: p.routePath,
      parentPageId: p.parentPageId,
      audience: p.audience as RoleAudience,
      isEnabled: p.isEnabled,
      icon: p.icon,
      displayOrder: p.displayOrder,
      isSystem: p.isSystem,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      effectiveEnabled,
    };
  }

  async togglePageEnabled(
    id: string,
    isEnabled: boolean,
  ): Promise<ApplicationPageEntity> {
    const existing = await this.findPageById(id);
    if (!existing) {
      throw new NotFoundException(`Halaman dengan ID ${id} tidak ditemukan`);
    }

    await this.db
      .update(applicationPages)
      .set({
        isEnabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(applicationPages.id, id));

    return (await this.findPageById(id))!;
  }

  async findRolePageIds(roleId: string): Promise<string[]> {
    const records = await this.db.query.rolePageAccess.findMany({
      where: eq(rolePageAccess.roleId, roleId),
    });
    return records.map((r) => r.pageId);
  }

  async assignPagesToRole(roleId: string, pageIds: string[]): Promise<void> {
    const role = await this.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException('Peran tidak ditemukan');
    }

    await this.db
      .delete(rolePageAccess)
      .where(eq(rolePageAccess.roleId, roleId));

    if (pageIds.length > 0) {
      const validPages = await this.db.query.applicationPages.findMany({
        where: inArray(applicationPages.id, pageIds),
      });

      if (validPages.length > 0) {
        await this.db.insert(rolePageAccess).values(
          validPages.map((vp) => ({
            roleId,
            pageId: vp.id,
          })),
        );
      }
    }

    const userRoleLinks = await this.db.query.userRoles.findMany({
      where: eq(userRoles.roleId, roleId),
    });
    const userIds = userRoleLinks.map((u) => u.userId);
    if (userIds.length > 0) {
      await this.db
        .update(users)
        .set({ authVersion: sql`auth_version + 1` })
        .where(inArray(users.id, userIds));
    }
  }

  async getEffectiveRoutesForRole(roleId: string): Promise<string[]> {
    const role = await this.findRoleById(roleId);
    if (!role || !role.isActive) return [];

    const allPages = await this.findAllPages();
    const assignedPageIds = new Set(await this.findRolePageIds(roleId));

    const isSuperAdmin = role.isSystem && role.code === 'admin';

    const accessibleRoutes: string[] = [];
    for (const p of allPages) {
      if (p.routePath === '#') continue;
      if (!p.effectiveEnabled) continue;

      if (isSuperAdmin && p.audience === 'internal') {
        accessibleRoutes.push(p.routePath);
      } else if (assignedPageIds.has(p.id)) {
        accessibleRoutes.push(p.routePath);
      }
    }

    return Array.from(new Set(accessibleRoutes));
  }

  async getUserEffectiveRoutes(userId: string): Promise<string[]> {
    const userRoleRecords = await this.db.query.userRoles.findMany({
      where: and(
        eq(userRoles.userId, userId),
        sql`${userRoles.revokedAt} IS NULL`,
      ),
      with: { role: true },
    });

    const staffRecord = await this.db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.userId, userId),
    });

    const distinctRoleIds = new Set<string>();
    for (const ur of userRoleRecords) {
      if (ur.roleId) distinctRoleIds.add(ur.roleId);
    }
    if (staffRecord?.roleId) {
      distinctRoleIds.add(staffRecord.roleId);
    }

    const routeSet = new Set<string>();
    for (const rId of distinctRoleIds) {
      const routes = await this.getEffectiveRoutesForRole(rId);
      for (const r of routes) {
        routeSet.add(r);
      }
    }

    return Array.from(routeSet);
  }
}

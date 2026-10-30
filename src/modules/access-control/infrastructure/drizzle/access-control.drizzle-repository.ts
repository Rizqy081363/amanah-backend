import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  permissions,
  rolePermissions,
  roles,
  staffProfiles,
  userRoles,
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
import {
  DEFAULT_ROLE_AUDIENCE,
  ROLE_AUDIENCE,
} from '../../../../common/constants/role-audience.constants';
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

    const staffCounts = await this.db
      .select({
        roleId: staffProfiles.roleId,
        count: sql<number>`count(*)::int`,
      })
      .from(staffProfiles)
      .where(sql`${staffProfiles.roleId} IS NOT NULL`)
      .groupBy(staffProfiles.roleId);

    const staffCountMap = new Map<string, number>();
    for (const sc of staffCounts) {
      if (sc.roleId) {
        staffCountMap.set(sc.roleId, sc.count);
      }
    }

    const roleMap = new Map<string, typeof allRoles[0]>();
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
              audience: (r.parentRole.audience as RoleAudience) || DEFAULT_ROLE_AUDIENCE,
              isClinical: r.parentRole.isClinical,
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
        staffCount: staffCountMap.get(r.id) ?? 0,
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
            audience: (roleRecord.parentRole.audience as RoleAudience) || DEFAULT_ROLE_AUDIENCE,
            isClinical: roleRecord.parentRole.isClinical,
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
    const existing = await this.db.query.roles.findFirst({
      where: eq(roles.code, data.code),
    });
    if (existing) {
      throw new BadRequestException(
        `Peran dengan kode '${data.code}' sudah terdaftar`,
      );
    }

    let audience: RoleAudience = (data.audience as RoleAudience) || DEFAULT_ROLE_AUDIENCE;
    let isClinical = Boolean(data.isClinical);
    if (data.parentRoleId) {
      const parent = await this.db.query.roles.findFirst({
        where: eq(roles.id, data.parentRoleId),
      });
      if (!parent) {
        throw new NotFoundException('Peran induk (parent role) tidak ditemukan');
      }
      if (data.audience === undefined && parent.audience) {
        audience = parent.audience as RoleAudience;
      }
      if (data.isClinical === undefined) {
        isClinical = parent.isClinical;
      }
    }

    const [inserted] = await this.db
      .insert(roles)
      .values({
        code: data.code,
        name: data.name,
        description: data.description || null,
        parentRoleId: data.parentRoleId || null,
        tier: data.tier || (data.parentRoleId ? 'micro' : 'macro'),
        audience,
        isClinical,
        isSystem: false,
      })
      .returning();

    if (data.permissionIds && data.permissionIds.length > 0) {
      await this.assignPermissionsToRole(inserted.id, data.permissionIds);
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
        updatedAt: new Date().toISOString(),
      })
      .where(eq(roles.id, id));

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

    if (existing.isSystem) {
      throw new BadRequestException(
        'Peran sistem bawaan tidak dapat dihapus',
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
    if (!role) return [];
    if (role.code === 'admin') {
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
      if (ur.roleId) distinctRoleIds.add(ur.roleId);
    }
    if (staffRecord?.roleId) {
      distinctRoleIds.add(staffRecord.roleId);
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
}

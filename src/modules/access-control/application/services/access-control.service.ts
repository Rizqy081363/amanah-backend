import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ACCESS_CONTROL_REPOSITORY,
  AccessControlRepository,
  CreateRoleInput,
  UpdateRoleInput,
} from '../../domain/repositories/access-control.repository.interface';
import { RoleAudience, RoleEntity } from '../../domain/entities/role.entity';
import { PermissionEntity } from '../../domain/entities/permission.entity';
import { ApplicationPageEntity } from '../../domain/entities/application-page.entity';

@Injectable()
export class AccessControlService {
  constructor(
    @Inject(ACCESS_CONTROL_REPOSITORY)
    private readonly repository: AccessControlRepository,
  ) {}

  async getAllRoles(): Promise<RoleEntity[]> {
    return this.repository.findAllRoles();
  }

  async getRoleTree(): Promise<RoleEntity[]> {
    return this.repository.findRoleTree();
  }

  async getRoleById(id: string): Promise<RoleEntity> {
    const role = await this.repository.findRoleById(id);
    if (!role) {
      throw new NotFoundException(`Peran dengan ID ${id} tidak ditemukan`);
    }
    return role;
  }

  async createRole(data: CreateRoleInput): Promise<RoleEntity> {
    return this.repository.createRole(data);
  }

  async updateRole(id: string, data: UpdateRoleInput): Promise<RoleEntity> {
    return this.repository.updateRole(id, data);
  }

  async deleteRole(id: string): Promise<void> {
    return this.repository.deleteRole(id);
  }

  async getAllPermissions(): Promise<PermissionEntity[]> {
    return this.repository.findAllPermissions();
  }

  async getGroupedPermissions(): Promise<Record<string, PermissionEntity[]>> {
    return this.repository.findPermissionsGrouped();
  }

  async getPermissionById(id: string): Promise<PermissionEntity> {
    const perm = await this.repository.findPermissionById(id);
    if (!perm) {
      throw new NotFoundException(`Perizinan dengan ID ${id} tidak ditemukan`);
    }
    return perm;
  }

  async assignPermissions(
    roleId: string,
    permissionIds: string[],
  ): Promise<RoleEntity> {
    await this.repository.assignPermissionsToRole(roleId, permissionIds);
    return this.getRoleById(roleId);
  }

  async addPermissionToRole(
    roleId: string,
    permissionId: string,
  ): Promise<RoleEntity> {
    await this.repository.addPermissionToRole(roleId, permissionId);
    return this.getRoleById(roleId);
  }

  async removePermissionFromRole(
    roleId: string,
    permissionId: string,
  ): Promise<RoleEntity> {
    await this.repository.removePermissionFromRole(roleId, permissionId);
    return this.getRoleById(roleId);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    return this.repository.getUserEffectivePermissions(userId);
  }

  async getAllPages(): Promise<ApplicationPageEntity[]> {
    return this.repository.findAllPages();
  }

  async getPageTree(audience?: RoleAudience): Promise<ApplicationPageEntity[]> {
    return this.repository.findPageTree(audience);
  }

  async togglePage(id: string, isEnabled: boolean): Promise<ApplicationPageEntity> {
    return this.repository.togglePageEnabled(id, isEnabled);
  }

  async getRolePageIds(roleId: string): Promise<string[]> {
    await this.getRoleById(roleId);
    return this.repository.findRolePageIds(roleId);
  }

  async assignPagesToRole(
    roleId: string,
    pageIds: string[],
  ): Promise<string[]> {
    await this.getRoleById(roleId);
    await this.repository.assignPagesToRole(roleId, pageIds);
    return this.getRolePageIds(roleId);
  }

  async getUserEffectiveRoutes(userId: string): Promise<string[]> {
    return this.repository.getUserEffectiveRoutes(userId);
  }

  async getRoleEffectiveRoutes(roleId: string): Promise<string[]> {
    return this.repository.getEffectiveRoutesForRole(roleId);
  }
}

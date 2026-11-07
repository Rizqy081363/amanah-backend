import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ACCESS_CONTROL_REPOSITORY,
  AccessControlRepository,
  CreatePageData,
  CreateRoleInput,
  UpdatePageData,
  UpdateRoleInput,
} from '../../domain/repositories/access-control.repository.interface';
import { RoleAudience, RoleEntity } from '../../domain/entities/role.entity';
import { PermissionEntity } from '../../domain/entities/permission.entity';
import { ApplicationPageEntity } from '../../domain/entities/application-page.entity';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { REALTIME_ROOMS } from '../../../notifications/notifications.constants';

@Injectable()
export class AccessControlService {
  constructor(
    @Inject(ACCESS_CONTROL_REPOSITORY)
    private readonly repository: AccessControlRepository,
    @Optional()
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
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
    const created = await this.repository.createRole(data);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { roleId: created.id, action: 'created' },
    );
    return created;
  }

  async updateRole(id: string, data: UpdateRoleInput): Promise<RoleEntity> {
    const updated = await this.repository.updateRole(id, data);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      {
        roleId: id,
        action: data.isActive !== undefined ? 'toggled' : 'updated',
        isActive: updated.isActive,
      },
    );
    return updated;
  }

  async deleteRole(id: string): Promise<void> {
    await this.repository.deleteRole(id);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { roleId: id, action: 'deleted' },
    );
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
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { roleId, action: 'permissions_assigned' },
    );
    return this.getRoleById(roleId);
  }

  async addPermissionToRole(
    roleId: string,
    permissionId: string,
  ): Promise<RoleEntity> {
    await this.repository.addPermissionToRole(roleId, permissionId);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { roleId, action: 'permission_added' },
    );
    return this.getRoleById(roleId);
  }

  async removePermissionFromRole(
    roleId: string,
    permissionId: string,
  ): Promise<RoleEntity> {
    await this.repository.removePermissionFromRole(roleId, permissionId);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { roleId, action: 'permission_removed' },
    );
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

  async togglePage(
    id: string,
    isEnabled: boolean,
  ): Promise<ApplicationPageEntity> {
    const page = await this.repository.togglePageEnabled(id, isEnabled);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { pageId: id, action: 'page_toggled' },
    );
    return page;
  }

  async createPage(data: CreatePageData): Promise<ApplicationPageEntity> {
    const page = await this.repository.createPage(data);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { pageId: page.id, action: 'page_created' },
    );
    return page;
  }

  async updatePage(
    id: string,
    data: UpdatePageData,
  ): Promise<ApplicationPageEntity> {
    const page = await this.repository.updatePage(id, data);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { pageId: id, action: 'page_updated' },
    );
    return page;
  }

  async detachChildren(parentId: string): Promise<number> {
    const count = await this.repository.detachChildren(parentId);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { pageId: parentId, action: 'children_detached' },
    );
    return count;
  }

  async deletePage(id: string): Promise<void> {
    await this.repository.deletePage(id);
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { pageId: id, action: 'page_deleted' },
    );
  }

  async findAllRouteAliases(): Promise<Record<string, string>> {
    return this.repository.findAllRouteAliases();
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
    void this.realtimeGateway?.emitToRoom?.(
      REALTIME_ROOMS.clinic,
      'roles:updated',
      { roleId, action: 'pages_assigned' },
    );
    return this.getRolePageIds(roleId);
  }

  async getUserEffectiveRoutes(userId: string): Promise<string[]> {
    return this.repository.getUserEffectiveRoutes(userId);
  }

  async getRoleEffectiveRoutes(roleId: string): Promise<string[]> {
    return this.repository.getEffectiveRoutesForRole(roleId);
  }
}

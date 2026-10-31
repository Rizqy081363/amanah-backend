import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import { AccessControlService } from '../application/services/access-control.service';
import {
  AssignPagesInput,
  AssignPagesSchema,
  AssignPermissionsInput,
  AssignPermissionsSchema,
  CreateRoleInput,
  CreateRoleSchema,
  RoleParamInput,
  RoleParamSchema,
  RolePermissionParamInput,
  RolePermissionParamSchema,
  UpdateRoleInput,
  UpdateRoleSchema,
} from './schemas';

@ApiTags('Admin Roles & RBAC')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/roles', version: '1' })
export class AdminRolesController {
  constructor(private readonly service: AccessControlService) {}

  @Get()
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary:
      'Mendapatkan seluruh daftar peran (macro & micro) dan hierarki perizinan',
  })
  async getAllRoles() {
    return this.service.getAllRoles();
  }

  @Get('tree')
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary:
      'Mendapatkan hierarki pohon peran (macro -> micro) untuk Role Studio',
  })
  async getRoleTree() {
    return this.service.getRoleTree();
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Mendapatkan detail peran berdasarkan ID' })
  async getRoleById(@Param(zodPipe(RoleParamSchema)) param: RoleParamInput) {
    return this.service.getRoleById(param.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('roles:manage')
  @ApiOperation({
    summary:
      'Membuat peran dinamis baru (dapat menentukan induk dan perizinan)',
  })
  async createRole(@Body(zodPipe(CreateRoleSchema)) dto: CreateRoleInput) {
    return this.service.createRole(dto);
  }

  @Patch(':id')
  @RequirePermissions('roles:manage')
  @ApiOperation({
    summary: 'Memperbarui nama, deskripsi, status klinis, atau induk peran',
  })
  async updateRole(
    @Param(zodPipe(RoleParamSchema)) param: RoleParamInput,
    @Body(zodPipe(UpdateRoleSchema)) dto: UpdateRoleInput,
  ) {
    return this.service.updateRole(param.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('roles:manage')
  @ApiOperation({
    summary:
      'Menghapus peran kustom (tidak dapat menghapus peran sistem/terpakai)',
  })
  async deleteRole(@Param(zodPipe(RoleParamSchema)) param: RoleParamInput) {
    await this.service.deleteRole(param.id);
  }

  @Post(':id/permissions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('roles:manage')
  @ApiOperation({
    summary: 'Menetapkan daftar izin langsung ke suatu peran (bulk set)',
  })
  async assignPermissions(
    @Param(zodPipe(RoleParamSchema)) param: RoleParamInput,
    @Body(zodPipe(AssignPermissionsSchema)) dto: AssignPermissionsInput,
  ) {
    return this.service.assignPermissions(param.id, dto.permissionIds);
  }

  @Post(':id/permissions/:permissionId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('roles:manage')
  @ApiOperation({ summary: 'Menambahkan satu izin granular ke suatu peran' })
  async addPermission(
    @Param(zodPipe(RolePermissionParamSchema)) param: RolePermissionParamInput,
  ) {
    return this.service.addPermissionToRole(param.id, param.permissionId);
  }

  @Delete(':id/permissions/:permissionId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('roles:manage')
  @ApiOperation({ summary: 'Mencabut satu izin granular dari suatu peran' })
  async removePermission(
    @Param(zodPipe(RolePermissionParamSchema)) param: RolePermissionParamInput,
  ) {
    return this.service.removePermissionFromRole(param.id, param.permissionId);
  }

  @Get(':id/pages')
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary:
      'Mendapatkan daftar ID halaman aplikasi yang diakses oleh peran ini',
  })
  async getRolePages(@Param(zodPipe(RoleParamSchema)) param: RoleParamInput) {
    return this.service.getRolePageIds(param.id);
  }

  @Put(':id/pages')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('roles:manage')
  @ApiOperation({
    summary: 'Menetapkan daftar halaman aplikasi ke suatu peran (bulk set)',
  })
  async assignPages(
    @Param(zodPipe(RoleParamSchema)) param: RoleParamInput,
    @Body(zodPipe(AssignPagesSchema)) dto: AssignPagesInput,
  ) {
    return this.service.assignPagesToRole(param.id, dto.pageIds);
  }

  @Get(':id/effective-routes')
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary:
      'Mendapatkan daftar rute efektif yang dapat diakses oleh peran ini',
  })
  async getRoleEffectiveRoutes(
    @Param(zodPipe(RoleParamSchema)) param: RoleParamInput,
  ) {
    return this.service.getRoleEffectiveRoutes(param.id);
  }
}

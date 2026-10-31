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
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { UserManagementService } from '../application/services/user-management.service';
import {
  BulkPurgeUsersInput,
  BulkPurgeUsersSchema,
  BulkUpdateUserStatusInput,
  BulkUpdateUserStatusSchema,
  ExportUsersQueryInput,
  ExportUsersQuerySchema,
  QueryUsersInput,
  QueryUsersSchema,
  RestoreExecuteInput,
  RestoreExecuteSchema,
  RestorePreviewInput,
  RestorePreviewSchema,
  UpdateUserInput,
  UpdateUserSchema,
  UpdateUserStatusInput,
  UpdateUserStatusSchema,
  UserParamInput,
  UserParamSchema,
} from './dto';

@ApiTags('Admin User Management (Data User & Identitas Sistem)')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/users', version: '1' })
export class UsersController {
  constructor(private readonly service: UserManagementService) {}

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({
    summary:
      'Mendapatkan daftar seluruh pengguna terdaftar (Role-Agnostic, Server-Side Paginated)',
  })
  async getUsers(@Query(zodPipe(QueryUsersSchema)) query: QueryUsersInput) {
    return this.service.findUsers(query);
  }

  @Get('backup-drivers')
  @RequirePermissions('users:read')
  @ApiOperation({
    summary:
      'Mendapatkan daftar driver ekspor/impor cadangan pengguna yang didukung secara dinamis',
  })
  async getBackupDrivers() {
    return this.service.getAvailableBackupDrivers();
  }

  @Get('export')
  @RequirePermissions('users:export')
  @ApiOperation({
    summary:
      'Mengekspor berkas pencadangan data pengguna secara lengkap melalui driver terpilih',
  })
  async exportUsers(
    @Query(zodPipe(ExportUsersQuerySchema)) query: ExportUsersQueryInput,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { data, filename, mimeType } = await this.service.exportUsers(
      query.format,
      user.id,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(data);
  }

  @Post('restore/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:restore')
  @ApiOperation({
    summary:
      'Melakukan validasi dan pratinjau berkas cadangan sebelum dieksekusi',
  })
  async previewRestore(
    @Body(zodPipe(RestorePreviewSchema)) dto: RestorePreviewInput,
  ) {
    return this.service.previewRestore(dto.format, dto.fileContent);
  }

  @Post('restore/execute')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:restore')
  @ApiOperation({
    summary: 'Mengeksekusi pemulihan data pengguna dari berkas cadangan',
  })
  async executeRestore(
    @Body(zodPipe(RestoreExecuteSchema)) dto: RestoreExecuteInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.executeRestore(
      dto.format,
      dto.fileContent,
      dto.duplicateStrategy,
      user.id,
    );
  }

  @Post('bulk-status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:manage')
  @ApiOperation({
    summary: 'Mengubah status aktivasi akun pengguna secara massal (Bulk)',
  })
  async bulkUpdateStatus(
    @Body(zodPipe(BulkUpdateUserStatusSchema)) dto: BulkUpdateUserStatusInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.bulkUpdateUserStatus(dto.userIds, dto.status, user.id);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:delete')
  @ApiOperation({
    summary:
      'Menghapus permanen (purging sistemik) akun pengguna secara massal (Bulk)',
  })
  async bulkPurgeUsers(
    @Body(zodPipe(BulkPurgeUsersSchema)) dto: BulkPurgeUsersInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.bulkPurgeUsers(dto.userIds, user.id);
  }

  @Get('roles')
  @RequirePermissions('users:read')
  @ApiOperation({
    summary:
      'Mendapatkan daftar seluruh peran aktif untuk penugasan akun pengguna',
  })
  async getAllActiveRoles() {
    return this.service.getAllActiveRoles();
  }

  @Get(':id')
  @RequirePermissions('users:read')
  @ApiOperation({
    summary: 'Mendapatkan detail profil dan relasi akun pengguna tunggal',
  })
  async getUserById(@Param(zodPipe(UserParamSchema)) param: UserParamInput) {
    return this.service.getUserById(param.id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:manage')
  @ApiOperation({
    summary: 'Memperbarui profil, data diri, dan penugasan peran pengguna',
  })
  async updateUser(
    @Param(zodPipe(UserParamSchema)) param: UserParamInput,
    @Body(zodPipe(UpdateUserSchema)) dto: UpdateUserInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.service.updateUser(param.id, dto, user.id);
    return {
      success: true,
      message: 'Data pengguna dan penugasan peran berhasil diperbarui.',
      user: updated,
    };
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:manage')
  @ApiOperation({
    summary: 'Mengaktifkan atau menonaktifkan akun pengguna tunggal',
  })
  async updateStatus(
    @Param(zodPipe(UserParamSchema)) param: UserParamInput,
    @Body(zodPipe(UpdateUserStatusSchema)) dto: UpdateUserStatusInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.service.updateUserStatus(param.id, dto.status, user.id);
    return {
      success: true,
      message: `Status akun pengguna berhasil diperbarui menjadi "${dto.status}".`,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('users:delete')
  @ApiOperation({
    summary:
      'Menghapus akun pengguna dan seluruh relasinya secara permanen (Purging Sistemik)',
  })
  async purgeUser(
    @Param(zodPipe(UserParamSchema)) param: UserParamInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const res = await this.service.purgeUser(param.id, user.id);
    return {
      success: true,
      message:
        'Akun pengguna dan seluruh datanya telah berhasil dihapus secara permanen dari sistem.',
      details: res.details,
    };
  }
}

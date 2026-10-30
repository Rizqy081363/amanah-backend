import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import { AccessControlService } from '../application/services/access-control.service';
import {
  PermissionParamInput,
  PermissionParamSchema,
} from './schemas';

@ApiTags('Admin Permissions Catalog')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/permissions', version: '1' })
export class AdminPermissionsController {
  constructor(private readonly service: AccessControlService) {}

  @Get()
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary: 'Mendapatkan seluruh katalog perizinan granular dalam sistem (flat list)',
  })
  async getAllPermissions() {
    return this.service.getAllPermissions();
  }

  @Get('grouped')
  @RequirePermissions('roles:read')
  @ApiOperation({
    summary: 'Mendapatkan katalog perizinan granular yang dikelompokkan berdasarkan modul/fitur',
  })
  async getGroupedPermissions() {
    return this.service.getGroupedPermissions();
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  @ApiOperation({ summary: 'Mendapatkan detail perizinan berdasarkan ID' })
  async getPermissionById(
    @Param(zodPipe(PermissionParamSchema)) param: PermissionParamInput,
  ) {
    return this.service.getPermissionById(param.id);
  }
}

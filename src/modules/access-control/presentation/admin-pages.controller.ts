import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import type { RequestWithUser } from '../../../utils/types/request-with-user.type';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { RoleAudience } from '../domain/entities/role.entity';
import { AccessControlService } from '../application/services/access-control.service';
import {
  PageParamInput,
  PageParamSchema,
  TogglePageInput,
  TogglePageSchema,
} from './schemas';

@ApiTags('Admin Application Pages Registry')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/pages', version: '1' })
export class AdminPagesController {
  constructor(private readonly service: AccessControlService) {}

  @Get()
  @RequirePermissions('pages:read', 'roles:read')
  @ApiOperation({
    summary:
      'Mendapatkan seluruh daftar halaman aplikasi dan status ketersediaannya',
  })
  async getAllPages() {
    return this.service.getAllPages();
  }

  @Get('tree')
  @RequirePermissions('pages:read', 'roles:read')
  @ApiOperation({
    summary: 'Mendapatkan hierarki pohon halaman aplikasi (parent -> children)',
  })
  async getPageTree(@Query('audience') audience?: RoleAudience) {
    return this.service.getPageTree(audience);
  }

  @Patch(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('pages:manage', 'roles:manage')
  @ApiOperation({
    summary: 'Mengubah status aktif/nonaktif global halaman (CMS kill switch)',
  })
  async togglePage(
    @Param(zodPipe(PageParamSchema)) param: PageParamInput,
    @Body(zodPipe(TogglePageSchema)) dto: TogglePageInput,
  ) {
    return this.service.togglePage(param.id, dto.isEnabled);
  }

  @Get('my-routes')
  @ApiOperation({
    summary:
      'Mendapatkan seluruh rute efektif yang diizinkan untuk akun yang sedang login',
  })
  async getMyEffectiveRoutes(
    @Request() request: RequestWithUser<AuthenticatedUser>,
  ) {
    return this.service.getUserEffectiveRoutes(request.user.id);
  }
}

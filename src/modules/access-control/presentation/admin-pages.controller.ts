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
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import type { RequestWithUser } from '../../../utils/types/request-with-user.type';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { RoleAudience } from '../domain/entities/role.entity';
import { AccessControlService } from '../application/services/access-control.service';
import {
  BulkPageActionInput,
  BulkPageActionSchema,
  CreatePageInput,
  CreatePageSchema,
  PageParamInput,
  PageParamSchema,
  TogglePageInput,
  TogglePageSchema,
  UpdatePageInput,
  UpdatePageSchema,
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
  @Public()
  @ApiOperation({
    summary: 'Mendapatkan hierarki pohon halaman aplikasi (parent -> children)',
  })
  async getPageTree(@Query('audience') audience?: RoleAudience) {
    return this.service.getPageTree(audience);
  }

  @Get('routes/aliases')
  @Public()
  @ApiOperation({
    summary:
      'Mendapatkan pemetaan seluruh route alias aktif untuk Next.js proxy rewrite',
  })
  async getAllRouteAliases() {
    return this.service.findAllRouteAliases();
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('pages:manage', 'roles:manage')
  @ApiOperation({
    summary: 'Membuat halaman atau folder kategori baru di CMS Page Registry',
  })
  async createPage(@Body(zodPipe(CreatePageSchema)) dto: CreatePageInput) {
    return this.service.createPage(dto);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('pages:manage', 'roles:manage')
  @ApiOperation({
    summary:
      'Eksekusi aksi massal halaman aplikasi (pemindahan kategori, pelepasan mandiri, toggle aktif, restore)',
  })
  async bulkPageAction(
    @Body(zodPipe(BulkPageActionSchema)) dto: BulkPageActionInput,
  ) {
    return this.service.bulkPageAction(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('pages:manage', 'roles:manage')
  @ApiOperation({
    summary:
      'Memperbarui metadata halaman atau folder (nama, ikon, urutan, folder induk)',
  })
  async updatePage(
    @Param(zodPipe(PageParamSchema)) param: PageParamInput,
    @Body(zodPipe(UpdatePageSchema)) dto: UpdatePageInput,
  ) {
    return this.service.updatePage(param.id, dto);
  }

  @Post(':id/detach-children')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('pages:manage', 'roles:manage')
  @ApiOperation({
    summary:
      'Melepaskan seluruh submenu dari kategori ini menjadi halaman mandiri tanpa folder induk',
  })
  async detachChildren(@Param(zodPipe(PageParamSchema)) param: PageParamInput) {
    const detachedCount = await this.service.detachChildren(param.id);
    return { success: true, detachedCount };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('pages:manage', 'roles:manage')
  @ApiOperation({
    summary: 'Menghapus halaman atau folder kustom non-sistem dari CMS',
  })
  async deletePage(@Param(zodPipe(PageParamSchema)) param: PageParamInput) {
    await this.service.deletePage(param.id);
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

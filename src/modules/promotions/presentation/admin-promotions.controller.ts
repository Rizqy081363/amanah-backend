import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import { PromotionsService } from '../application/promotions.service';
import {
  CreatePromotionInput,
  CreatePromotionSchema,
  QueryPromotionsInput,
  QueryPromotionsSchema,
  UpdatePromotionInput,
  UpdatePromotionSchema,
} from './schemas/promotion.schema';

@ApiTags('Admin Promotions & Announcements')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('clinics:manage')
@Controller({ path: 'admin/promotions', version: '1' })
export class AdminPromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Mendapatkan seluruh daftar promosi untuk audit admin',
    description:
      'Mendukung filter berdasarkan status (draft, scheduled, live, expired, archived), pencarian judul, dan relasi layanan.',
  })
  @ApiOkResponse({ description: 'Daftar promosi berhasil diambil' })
  async getPromotions(
    @Query(zodPipe(QueryPromotionsSchema)) query: QueryPromotionsInput,
  ) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const offset = (page - 1) * limit;

    return this.promotionsService.getAdminPromotions({
      status: query.status,
      search: query.search,
      serviceId: query.serviceId,
      limit,
      offset,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Membuat promosi atau pengumuman baru (Draft atau Langsung Terbit)',
    description:
      'Menyimpan konten, referensi gambar, tombol aksi, dan jadwal promosi. Jika broadcast aktif dan status langsung live, notifikasi akan dikirimkan.',
  })
  @ApiCreatedResponse({ description: 'Promosi berhasil dibuat' })
  async createPromotion(
    @Body(zodPipe(CreatePromotionSchema)) dto: CreatePromotionInput,
    @CurrentUser() user: any,
  ) {
    return this.promotionsService.createPromotion(dto, user?.id);
  }

  @Post('trigger-scheduled-broadcast')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Memicu pemrosesan broadcast promo terjadwal yang telah masuk periode tayang (Cron Trigger)',
  })
  async triggerScheduledBroadcast() {
    const count = await this.promotionsService.triggerScheduledBroadcast();
    return {
      success: true,
      processedCount: count,
      message: `Berhasil memproses ${count} promo terjadwal`,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Mendapatkan detail spesifik promosi berdasarkan ID',
  })
  @ApiParam({ name: 'id', description: 'UUID promosi' })
  @ApiOkResponse({ description: 'Detail promosi berhasil diambil' })
  async getPromotionById(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.getPromotionById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Memperbarui data promosi',
  })
  @ApiParam({ name: 'id', description: 'UUID promosi' })
  @ApiOkResponse({ description: 'Promosi berhasil diperbarui' })
  async updatePromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(UpdatePromotionSchema)) dto: UpdatePromotionInput,
    @CurrentUser() user: any,
  ) {
    return this.promotionsService.updatePromotion(id, dto, user?.id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menerbitkan promosi (is_published = true)',
  })
  @ApiParam({ name: 'id', description: 'UUID promosi' })
  async publishPromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.promotionsService.publishPromotion(id, user?.id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menonaktifkan / membatalkan penerbitan promosi (is_published = false)',
  })
  @ApiParam({ name: 'id', description: 'UUID promosi' })
  async unpublishPromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.promotionsService.unpublishPromotion(id, user?.id);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menduplikasi promosi yang ada menjadi salinan draf baru',
  })
  @ApiParam({ name: 'id', description: 'UUID promosi yang akan disalin' })
  async duplicatePromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.promotionsService.duplicatePromotion(id, user?.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mengarsipkan / menghapus promosi (Soft delete)',
  })
  @ApiParam({ name: 'id', description: 'UUID promosi yang akan diarsipkan' })
  async deletePromotion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.promotionsService.deletePromotion(id, user?.id);
  }
}

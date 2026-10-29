import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { SYSTEM_ROLES } from '../../../common/auth/roles.enum';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { ExportsService } from '../application/exports.service';
import { CheckExportAvailabilityDto } from './dto/check-export-availability.dto';
import { CreateExportDto } from './dto/create-export.dto';

@ApiTags('Exports (Pipeline Asinkronus Berkas & Artefak)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
@Controller({ path: 'exports', version: '1' })
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Mengajukan permintaan ekspor berkas data asinkronus (202 Accepted)',
    description:
      'Mendaftarkan job ekspor ke antrean RabbitMQ, mengembalikan jobId untuk pelacakan progress via polling atau notifikasi FCM.',
  })
  @ApiAcceptedResponse({
    description: 'Permintaan ekspor berhasil diterima dan sedang diantrekan',
  })
  async createExport(
    @Body() dto: CreateExportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.exportsService.requestExport(dto, user.id, idempotencyKey);
  }

  @Post('check-availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mengecek ketersediaan data untuk parameter ekspor sebelum submit',
    description:
      'Menghitung jumlah rekaman data yang cocok di basis data secara instan untuk mencegah pengunduhan data kosong.',
  })
  @ApiOkResponse({ description: 'Ketersediaan data berhasil diverifikasi' })
  async checkAvailability(
    @Body() dto: CheckExportAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exportsService.checkAvailability(
      dto.exportType,
      dto.parameters || {},
      user.id,
    );
  }

  @Get('my-history')
  @ApiOperation({
    summary: 'Melihat riwayat tugas ekspor berkas milik staf/user yang sedang login',
  })
  @ApiOkResponse({ description: 'Daftar riwayat job ekspor berhasil diambil' })
  async getMyHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.exportsService.getMyHistory(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Mengecek status dan progress real-time dari job ekspor',
  })
  @ApiOkResponse({ description: 'Detail status progress ekspor berkas' })
  @ApiNotFoundResponse({ description: 'Job ekspor tidak ditemukan' })
  async getJobStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exportsService.getJobStatus(id, user.id);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Mengunduh berkas fisik laporan yang telah selesai digenerate',
  })
  @ApiOkResponse({ description: 'Aliran berkas biner (CSV / XLSX / PDF)' })
  @ApiConflictResponse({ description: 'Job belum selesai atau berkas belum siap' })
  @ApiNotFoundResponse({ description: 'Job ekspor atau berkas tidak ditemukan' })
  async downloadFile(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const file = await this.exportsService.getDownloadFile(id, user.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.byteSize);
    return res.download(file.filePath, file.originalName);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Membatalkan tugas ekspor yang sedang diantrekan atau berjalan',
  })
  @ApiOkResponse({ description: 'Tugas ekspor berhasil dibatalkan' })
  async cancelExport(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exportsService.cancelExport(id, user.id);
  }
}

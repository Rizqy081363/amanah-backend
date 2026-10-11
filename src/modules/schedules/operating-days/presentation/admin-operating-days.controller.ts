import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { Roles } from '@common/auth/roles.decorator';
import { RolesGuard } from '@common/auth/roles.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DrizzleOperatingDaysRepository } from '../infrastructure/drizzle-operating-days.repository';
import { UpdateOperatingDaysBatchDto } from './dto/update-operating-days.dto';
import { OperatingDayEntity } from '../domain/entities/operating-day.entity';

@ApiTags('Admin Operating Days (Pengaturan Hari Operasional Klinik)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya administrator yang berwenang mengubah konfigurasi',
})
@Controller({ path: 'admin/operating-days', version: '1' })
export class AdminOperatingDaysController {
  constructor(
    private readonly operatingDaysRepo: DrizzleOperatingDaysRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Ambil seluruh konfigurasi hari operasional klinik (Senin - Minggu)',
  })
  @ApiOkResponse({
    description: 'Data status hari operasional klinik berhasil diambil',
  })
  async getOperatingDays(): Promise<OperatingDayEntity[]> {
    return this.operatingDaysRepo.findAll();
  }

  @Put('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perbarui status aktif/nonaktif hari operasional klinik secara batch',
  })
  @ApiOkResponse({
    description: 'Status hari operasional berhasil diperbarui',
  })
  async updateOperatingDays(
    @Body() dto: UpdateOperatingDaysBatchDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.operatingDaysRepo.batchUpdateStatus(dto.days);
    return {
      success: true,
      message: 'Status hari operasional klinik berhasil diperbarui',
    };
  }
}

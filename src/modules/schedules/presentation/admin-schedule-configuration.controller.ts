import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { Roles } from '@common/auth/roles.decorator';
import { RolesGuard } from '@common/auth/roles.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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
import {
  DrizzleAdminScheduleConfigurationRepository,
  ScheduleConfigurationData,
} from '../infrastructure/drizzle/repositories/admin/drizzle-admin-schedule-configuration.repository';
import {
  EvaluateScheduleImpactDto,
  ScheduleConfigurationImpactResultDto,
  UpdateClinicSettingsBatchDto,
  UpdateScheduleConfigurationBatchDto,
  UpdateSessionDefsBatchDto,
  UpdateWeeklyTemplatesBatchDto,
} from './dto/admin-schedule-configuration.dto';

@ApiTags(
  'Admin Schedule Configuration (Pengaturan Operasional Jadwal & Klinik)',
)
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Hanya administrator yang berwenang mengubah konfigurasi',
})
@Controller({ path: 'admin/schedule-configuration', version: '1' })
export class AdminScheduleConfigurationController {
  constructor(
    private readonly configRepo: DrizzleAdminScheduleConfigurationRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Ambil seluruh konfigurasi operasional jadwal dan parameter klinik',
  })
  @ApiOkResponse({
    description:
      'Data konfigurasi shift, template mingguan, dan parameter klinik berhasil diambil',
  })
  async getConfiguration(): Promise<ScheduleConfigurationData> {
    return this.configRepo.getConfiguration();
  }

  @Post('evaluate-impact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Evaluasi dampak perubahan konfigurasi jadwal terhadap dokter dan janji temu aktif',
  })
  @ApiOkResponse({
    description: 'Hasil analisis dampak perubahan jadwal dan janji temu pasien',
    type: ScheduleConfigurationImpactResultDto,
  })
  async evaluateImpact(
    @Body() dto: EvaluateScheduleImpactDto,
  ): Promise<ScheduleConfigurationImpactResultDto> {
    return this.configRepo.evaluateImpact(dto);
  }

  @Put('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Perbarui konfigurasi jadwal operasional dan klinik secara atomik (batch)',
  })
  @ApiOkResponse({
    description:
      'Konfigurasi berhasil disimpan dan cache operasional telah diperbarui',
  })
  async batchUpdate(
    @Body() dto: UpdateScheduleConfigurationBatchDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.configRepo.batchUpdateConfiguration(dto);
    return {
      success: true,
      message: 'Konfigurasi jadwal operasional dan klinik berhasil diperbarui',
    };
  }

  @Put('session-defs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perbarui konfigurasi definisi shift operasional klinik',
  })
  @ApiOkResponse({
    description: 'Definisi shift operasional berhasil diperbarui',
  })
  async updateSessionDefs(
    @Body() dto: UpdateSessionDefsBatchDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.configRepo.updateSessionDefs(dto.defs);
    return {
      success: true,
      message: 'Definisi shift operasional berhasil diperbarui',
    };
  }

  @Put('weekly-templates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perbarui template jadwal mingguan shift operasional klinik',
  })
  @ApiOkResponse({
    description: 'Template jadwal mingguan berhasil diperbarui',
  })
  async updateWeeklyTemplates(
    @Body() dto: UpdateWeeklyTemplatesBatchDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.configRepo.updateWeeklyTemplates(dto.templates);
    return {
      success: true,
      message: 'Template jadwal mingguan operasional berhasil diperbarui',
    };
  }

  @Put('clinic-settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perbarui nilai parameter konfigurasi klinik',
  })
  @ApiOkResponse({
    description: 'Parameter konfigurasi klinik berhasil diperbarui',
  })
  async updateClinicSettings(
    @Body() dto: UpdateClinicSettingsBatchDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.configRepo.updateClinicSettings(dto.settings);
    return {
      success: true,
      message: 'Parameter konfigurasi klinik berhasil diperbarui',
    };
  }
}

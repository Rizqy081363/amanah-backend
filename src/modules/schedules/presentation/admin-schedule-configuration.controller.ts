import { type AuthenticatedUser, CurrentUser } from '@common/auth';
import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { Roles } from '@common/auth/roles.decorator';
import { RolesGuard } from '@common/auth/roles.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
import { SYSTEM_ROLES } from '@/auth/constants/auth.constants';
import { UpdateOperationalShiftUseCase } from '../application/use-cases/update-operational-shift.use-case';
import {
  DrizzleAdminScheduleConfigurationRepository,
  ScheduleConfigurationData,
} from '../infrastructure/drizzle/repositories/admin/drizzle-admin-schedule-configuration.repository';
import {
  CreateSessionDefDto,
  DeleteSessionDefDto,
  EvaluateScheduleImpactDto,
  ScheduleConfigurationImpactResultDto,
  SessionDefImpactResultDto,
  UpdateClinicSettingsBatchDto,
  UpdateScheduleConfigurationBatchDto,
  UpdateSessionDefsBatchDto,
  UpdateSingleSessionDefDto,
  UpdateWeeklyTemplatesBatchDto,
} from './dto/admin-schedule-configuration.dto';

@ApiTags(
  'Admin Schedule Configuration (Pengaturan Operasional Jadwal & Klinik)',
)
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(SYSTEM_ROLES.ADMIN)
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
    private readonly updateOperationalShiftUseCase: UpdateOperationalShiftUseCase,
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
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const res = await this.updateOperationalShiftUseCase.execute(
      dto.defs,
      user,
    );
    return {
      success: res.success,
      message: res.message,
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

  @Post('session-defs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Buat definisi shift operasional baru secara dinamis',
  })
  @ApiOkResponse({
    description: 'Definisi shift operasional baru berhasil dibuat',
  })
  async createSessionDef(@Body() dto: CreateSessionDefDto) {
    const created = await this.configRepo.createSessionDef(dto);
    return {
      success: true,
      message: `Shift '${created.label}' berhasil dibuat`,
      data: created,
    };
  }

  @Get('session-defs/:id')
  @ApiOperation({
    summary: 'Ambil detail satu definisi shift operasional berdasarkan ID',
  })
  @ApiOkResponse({
    description: 'Detail definisi shift operasional berhasil diambil',
  })
  async getSessionDefById(@Param('id', ParseUUIDPipe) id: string) {
    return this.configRepo.getSessionDefById(id);
  }

  @Get('session-defs/:id/impact')
  @ApiOperation({
    summary:
      'Evaluasi dampak penghapusan/penonaktifan shift operasional terhadap dokter dan template',
  })
  @ApiOkResponse({
    description: 'Daftar dokter dan dependensi yang terdampak oleh shift ini',
    type: SessionDefImpactResultDto,
  })
  async getSessionDefImpact(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionDefImpactResultDto> {
    return this.configRepo.getSessionDefImpact(id);
  }

  @Put('session-defs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Perbarui satu definisi shift operasional secara mandiri',
  })
  @ApiOkResponse({
    description: 'Definisi shift operasional berhasil diperbarui',
  })
  async updateSingleSessionDef(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSingleSessionDefDto,
  ) {
    const updated = await this.configRepo.updateSingleSessionDef(id, dto);
    return {
      success: true,
      message: `Shift '${updated.label}' berhasil diperbarui`,
      data: updated,
    };
  }

  @Delete('session-defs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Hapus definisi shift operasional (dengan opsi cascade dan friction guard ala GitHub)',
  })
  @ApiOkResponse({
    description: 'Shift operasional berhasil dihapus',
  })
  async deleteSessionDef(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() bodyDto?: DeleteSessionDefDto,
    @Query('cascade') cascadeQuery?: string,
    @Query('confirmText') confirmTextQuery?: string,
  ) {
    const isCascade =
      bodyDto?.cascade === true ||
      cascadeQuery === 'true' ||
      cascadeQuery === '1';
    const confirmText = bodyDto?.confirmText ?? confirmTextQuery;

    return this.configRepo.deleteSessionDef(id, {
      cascade: isCascade,
      confirmText,
    });
  }
}

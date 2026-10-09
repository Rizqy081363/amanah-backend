import { CurrentUser } from '@common/auth/current-user.decorator';
import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { Roles } from '@common/auth/roles.decorator';
import { RolesGuard } from '@common/auth/roles.guard';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  DoctorRosterOverviewResponse,
  DoctorScheduleHistoryResponse,
  UpdateDoctorRosterDto,
} from '../domain/doctor-roster.entity';
import {
  DOCTOR_ROSTER_REPOSITORY,
  DoctorRosterRepository,
} from '../domain/doctor-roster.repository';

@ApiTags('Admin Doctor Schedules - Roster & History')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAF')
@Controller({ path: 'admin/doctor-schedules', version: '1' })
export class AdminDoctorRosterController {
  constructor(
    @Inject(DOCTOR_ROSTER_REPOSITORY)
    private readonly rosterRepo: DoctorRosterRepository,
  ) {}

  @Get(':id/assignments')
  @ApiOperation({
    summary: 'Mendapatkan matriks hari dan shift kerja dokter (Roster Mingguan)',
  })
  @ApiParam({ name: 'id', description: 'ID praktisi / dokter' })
  @ApiOkResponse({ type: DoctorRosterOverviewResponse })
  async getDoctorAssignments(
    @Param('id') id: string,
  ): Promise<DoctorRosterOverviewResponse> {
    return this.rosterRepo.getDoctorRoster(id);
  }

  @Put(':id/assignments')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Menyimpan konfigurasi hari dan shift kerja dokter (Roster Mingguan)',
  })
  @ApiParam({ name: 'id', description: 'ID praktisi / dokter' })
  @ApiOkResponse({ type: DoctorRosterOverviewResponse })
  async updateDoctorAssignments(
    @Param('id') id: string,
    @Body() dto: UpdateDoctorRosterDto,
    @CurrentUser() user?: any,
  ): Promise<DoctorRosterOverviewResponse> {
    const userId = user?.id || user?.sub;
    return this.rosterRepo.updateDoctorRoster(id, dto, userId);
  }

  @Get(':id/history')
  @ApiOperation({
    summary: 'Mendapatkan riwayat audit perubahan status dan jadwal praktik dokter',
  })
  @ApiParam({ name: 'id', description: 'ID praktisi / dokter' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse({ type: DoctorScheduleHistoryResponse })
  async getDoctorScheduleHistory(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<DoctorScheduleHistoryResponse> {
    const parsedLimit = limit ? Number(limit) : 20;
    const parsedOffset = offset ? Number(offset) : 0;
    return this.rosterRepo.getDoctorScheduleHistory(id, parsedLimit, parsedOffset);
  }
}

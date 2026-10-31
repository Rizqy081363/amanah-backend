import {
  type AuthenticatedUser,
  isAdminUser,
  PermissionsGuard,
  RequirePermissions,
} from '@common/auth';
import { CurrentUser } from '@common/auth/current-user.decorator';
import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { DomainForbiddenException } from '@common/exceptions';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
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
@UseGuards(HybridAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/doctor-schedules', version: '1' })
export class AdminDoctorRosterController {
  constructor(
    @Inject(DOCTOR_ROSTER_REPOSITORY)
    private readonly rosterRepo: DoctorRosterRepository,
  ) {}

  private assertDoctorAccess(id: string, user?: AuthenticatedUser) {
    if (!user || isAdminUser(user)) return;
    const isOwner = user.staff?.practitionerId === id || user.staff?.id === id;
    if (!isOwner) {
      throw new DomainForbiddenException(
        'Akses ditolak: Anda hanya berwenang mengakses data jadwal dokter Anda sendiri',
      );
    }
  }

  @Get(':id/assignments')
  @RequirePermissions('schedules:read')
  @ApiOperation({
    summary:
      'Mendapatkan matriks hari dan shift kerja dokter (Roster Mingguan)',
  })
  @ApiParam({ name: 'id', description: 'ID praktisi / dokter' })
  @ApiOkResponse({ type: DoctorRosterOverviewResponse })
  async getDoctorAssignments(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<DoctorRosterOverviewResponse> {
    this.assertDoctorAccess(id, user);
    return this.rosterRepo.getDoctorRoster(id);
  }

  @Put(':id/assignments')
  @RequirePermissions('schedules:manage')
  @ApiOperation({
    summary:
      'Menyimpan konfigurasi hari dan shift kerja dokter (Roster Mingguan)',
  })
  @ApiParam({ name: 'id', description: 'ID praktisi / dokter' })
  @ApiOkResponse({ type: DoctorRosterOverviewResponse })
  async updateDoctorAssignments(
    @Param('id') id: string,
    @Body() dto: UpdateDoctorRosterDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<DoctorRosterOverviewResponse> {
    this.assertDoctorAccess(id, user);
    const userId = user?.id;
    return this.rosterRepo.updateDoctorRoster(id, dto, userId);
  }

  @Delete(':id/assignments')
  @RequirePermissions('schedules:manage')
  @ApiOperation({
    summary:
      'Mereset roster kerja dokter kembali ke template mingguan default klinik',
  })
  @ApiParam({ name: 'id', description: 'ID praktisi / dokter' })
  @ApiOkResponse({ type: DoctorRosterOverviewResponse })
  async resetDoctorAssignments(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<DoctorRosterOverviewResponse> {
    this.assertDoctorAccess(id, user);
    const userId = user?.id;
    return this.rosterRepo.resetDoctorRoster(id, userId);
  }

  @Post(':id/assignments/reset')
  @RequirePermissions('schedules:manage')
  @ApiOperation({
    summary:
      'Mereset roster kerja dokter kembali ke template mingguan default klinik',
  })
  @ApiParam({ name: 'id', description: 'ID praktisi / dokter' })
  @ApiOkResponse({ type: DoctorRosterOverviewResponse })
  async resetDoctorAssignmentsPost(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<DoctorRosterOverviewResponse> {
    this.assertDoctorAccess(id, user);
    const userId = user?.id;
    return this.rosterRepo.resetDoctorRoster(id, userId);
  }

  @Get(':id/history')
  @RequirePermissions('schedules:read')
  @ApiOperation({
    summary:
      'Mendapatkan riwayat audit perubahan status dan jadwal praktik dokter',
  })
  @ApiParam({ name: 'id', description: 'ID praktisi / dokter' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse({ type: DoctorScheduleHistoryResponse })
  async getDoctorScheduleHistory(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<DoctorScheduleHistoryResponse> {
    this.assertDoctorAccess(id, user);
    const parsedLimit = limit ? Number(limit) : 20;
    const parsedOffset = offset ? Number(offset) : 0;
    return this.rosterRepo.getDoctorScheduleHistory(
      id,
      parsedLimit,
      parsedOffset,
    );
  }
}

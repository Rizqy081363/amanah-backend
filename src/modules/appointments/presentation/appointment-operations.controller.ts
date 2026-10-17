import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { CancelAppointmentUseCase } from '../application/use-cases/cancel-appointment.use-case';
import { CompleteServiceUseCase } from '../application/use-cases/complete-service.use-case';
import { StartServiceUseCase } from '../application/use-cases/start-service.use-case';
import { SweepLateAppointmentsUseCase } from '../application/use-cases/sweep-late-appointments.use-case';
import { AppointmentDomainExceptionFilter } from './filters/appointment-domain-exception.filter';

@ApiTags('Appointments Operations (Operasional Antrean & Status)')
@UseFilters(AppointmentDomainExceptionFilter)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentOperationsController {
  constructor(
    private readonly startServiceUseCase: StartServiceUseCase,
    private readonly completeServiceUseCase: CompleteServiceUseCase,
    private readonly cancelAppointmentUseCase: CancelAppointmentUseCase,
    private readonly sweepLateAppointmentsUseCase: SweepLateAppointmentsUseCase,
  ) {}

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mulai pemeriksaan konsultasi pasien (WAITING -> IN_SERVICE)',
  })
  @ApiParam({ name: 'id', description: 'ID unik janji temu' })
  @ApiOkResponse({ description: 'Pemeriksaan dimulai' })
  @ApiNotFoundResponse({ description: 'Janji temu tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Token tidak valid' })
  @ApiForbiddenResponse({ description: 'Akses ditolak' })
  async startService(@Param('id') id: string, @CurrentUser() user?: any) {
    return this.startServiceUseCase.execute(id, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Selesaikan pemeriksaan konsultasi pasien (IN_SERVICE -> COMPLETED)',
  })
  @ApiParam({ name: 'id', description: 'ID unik janji temu' })
  @ApiOkResponse({ description: 'Pemeriksaan selesai' })
  @ApiNotFoundResponse({ description: 'Janji temu tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Token tidak valid' })
  @ApiForbiddenResponse({ description: 'Akses ditolak' })
  async completeService(@Param('id') id: string, @CurrentUser() user?: any) {
    return this.completeServiceUseCase.execute(id, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batalkan janji temu pasien (WAITING -> CANCELLED)',
  })
  @ApiParam({ name: 'id', description: 'ID unik janji temu' })
  @ApiOkResponse({ description: 'Janji temu dibatalkan' })
  @ApiNotFoundResponse({ description: 'Janji temu tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Token tidak valid' })
  @ApiForbiddenResponse({ description: 'Akses ditolak' })
  async cancelAppointment(
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @CurrentUser() user?: any,
  ) {
    return this.cancelAppointmentUseCase.execute(id, reason, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Post('sweep-late')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sapuan otomatis janji temu terlambat lebih dari 24 jam ke LATE',
  })
  @ApiOkResponse({ description: 'Sapuan lateness selesai dieksekusi' })
  async sweepLate() {
    const sweptCount = await this.sweepLateAppointmentsUseCase.execute();
    return { success: true, sweptCount };
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseUUIDPipe,
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
import { AppointmentCallLifecycleService } from '../application/appointment-call-lifecycle.service';
import { CallPatientUseCase } from '../application/use-cases/call-patient.use-case';
import { APPOINTMENT_CALL_REPOSITORY } from '../domain/constants/appointment-lifecycle.constants';
import { AppointmentCallRepository } from '../domain/repositories/appointment-call.repository';
import { AppointmentCallActionDto } from './dto/appointment-call.dto';
import { AppointmentDomainExceptionFilter } from './filters/appointment-domain-exception.filter';

@ApiTags('Appointments Lifecycle (Panggilan & Status Antrean)')
@UseFilters(AppointmentDomainExceptionFilter)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentCallController {
  constructor(
    private readonly callLifecycleService: AppointmentCallLifecycleService,
    @Inject(APPOINTMENT_CALL_REPOSITORY)
    private readonly callRepo: AppointmentCallRepository,
    @Optional()
    private readonly callPatientUseCase?: CallPatientUseCase,
  ) {}

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Post(':id/call')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Panggil pasien ke ruang periksa (Dokter / Staf)',
    description:
      'Mencatat riwayat panggilan pasien, memperbarui status tiket, dan menerbitkan event notifikasi real-time.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID unik appointment',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Pasien berhasil dipanggil' })
  @ApiNotFoundResponse({ description: 'Janji temu tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Token tidak valid' })
  @ApiForbiddenResponse({
    description: 'Hanya Dokter atau Staf yang diizinkan',
  })
  async callPatient(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AppointmentCallActionDto,
    @CurrentUser() user: any,
  ) {
    const callerId = user?.id || user?.sub || 'system';
    const result = await this.callLifecycleService.callPatient(
      id,
      callerId,
      body?.notes,
    );
    if (this.callPatientUseCase) {
      try {
        await this.callPatientUseCase.execute(id);
      } catch (_) {}
    }
    return result;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Post(':id/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Konfirmasi kehadiran pasien setelah dipanggil (Dokter / Staf)',
    description:
      'Mencatat waktu respons pasien dan memindahkan status appointment ke in_consultation.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID unik appointment',
  })
  @ApiOkResponse({ description: 'Kehadiran pasien berhasil dikonfirmasi' })
  @ApiNotFoundResponse({ description: 'Janji temu tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Token tidak valid' })
  @ApiForbiddenResponse({
    description: 'Hanya Dokter atau Staf yang diizinkan',
  })
  async patientResponded(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: any,
  ) {
    const callerId = user?.id || user?.sub || 'system';
    return this.callLifecycleService.patientResponded(id, callerId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pasien tidak merespons panggilan (Dokter / Staf)',
    description:
      'Mencatat panggilan tidak terjawab. Jika percobaan < 3, antrean di-requeue ke belakang. Jika percobaan = 3, status menjadi no_show (terminal).',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID unik appointment',
  })
  @ApiOkResponse({
    description:
      'Panggilan tidak merespons berhasil diproses (requeued atau terminal no_show)',
  })
  @ApiNotFoundResponse({ description: 'Janji temu tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Token tidak valid' })
  @ApiForbiddenResponse({
    description: 'Hanya Dokter atau Staf yang diizinkan',
  })
  async patientNoShow(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AppointmentCallActionDto,
    @CurrentUser() user: any,
  ) {
    const callerId = user?.id || user?.sub || 'system';
    return this.callLifecycleService.patientNoShow(id, callerId, body.notes);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Get(':id/call-attempts')
  @ApiOperation({
    summary: 'Melihat riwayat percobaan pemanggilan pasien untuk appointment',
    description:
      'Mengambil daftar seluruh percobaan pemanggilan (attempt 1, 2, 3), waktu panggilan, status, dan catatan.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID unik appointment',
  })
  @ApiOkResponse({ description: 'Riwayat panggilan berhasil diambil' })
  @ApiNotFoundResponse({ description: 'Janji temu tidak ditemukan' })
  async getCallAttempts(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.callRepo.findAttemptsByAppointmentId(id);
  }
}

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { AppointmentsService } from '../application/appointments.service';
import { AdminUpdateAppointmentStatusDto } from './dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';

@ApiTags('Admin Appointments (Manajemen Janji Temu & Antrean)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAF')
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya administrator atau staf klinik',
})
@Controller({ path: 'admin/appointments', version: '1' })
export class AdminAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Patch(':appointmentId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Membatalkan janji temu pasien dan memulihkan kuota slot sesi (Admin/Staf)',
    description:
      'Membatalkan janji temu, memvalidasi state machine (menolak in_service dan completed dengan 400 Bad Request), idempoten untuk yang sudah berstatus batal, serta mengembalikan kuota slot sesi (+1) dan mengembalikan status sesi ke open bila sebelumnya penuh/terisi.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({
    description:
      'Janji temu berhasil dibatalkan dan 1 slot kuota sesi telah dipulihkan',
  })
  @ApiNotFoundResponse({
    description: 'Janji temu tidak ditemukan',
  })
  async cancelAppointment(
    @Param('appointmentId') appointmentId: string,
    @Body() body: CancelAppointmentDto,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.cancelAdminAppointment(
      appointmentId,
      body,
      user,
    );
  }

  @Patch(':appointmentId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Memperbarui status alur antrean janji temu pasien (Admin/Staf)',
    description:
      'Mengubah status antrean pasien (waiting, in_service, completed, no_show, cancelled). Memulihkan slot sesi kuota jika status dialihkan ke cancelled/no_show.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({
    description: 'Status janji temu antrean berhasil diperbarui',
  })
  @ApiNotFoundResponse({
    description: 'Janji temu tidak ditemukan',
  })
  async updateStatus(
    @Param('appointmentId') appointmentId: string,
    @Body() body: AdminUpdateAppointmentStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.updateAdminAppointmentStatus(
      appointmentId,
      body,
      user,
    );
  }
}

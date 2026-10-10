import {
  Body,
  Controller,
  Get,
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
import { AppointmentCandidateResolver } from '../application/resolvers/appointment-candidate.resolver';
import { AppointmentAssignmentService } from '../application/services/appointment-assignment.service';
import { AdminUpdateAppointmentStatusDto } from './dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { ChangeAppointmentDoctorDto } from './dto/change-appointment-doctor.dto';
import { ChangeAppointmentRoomDto } from './dto/change-appointment-room.dto';

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
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly candidateResolver: AppointmentCandidateResolver,
    private readonly assignmentService: AppointmentAssignmentService,
  ) {}

  @Patch(':appointmentId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Membatalkan janji temu pasien (Admin/Staf)',
    description:
      'Membatalkan janji temu, memvalidasi state machine (menolak in_service dan completed dengan 400 Bad Request), dan idempoten untuk yang sudah berstatus batal.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({
    description: 'Janji temu berhasil dibatalkan',
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
      'Mengubah status antrean pasien (waiting, in_service, completed, no_show, cancelled).',
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

  @Get(':appointmentId/candidates/doctors')
  @ApiOperation({
    summary:
      'Mendapatkan kandidat dokter yang tersedia untuk janji temu (Admin/Staf)',
    description:
      'Mengambil daftar dokter yang dapat ditugaskan untuk jam dan tanggal janji temu ini, dikelompokkan secara dinamis berdasarkan poli/spesialisasi.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
  })
  async getDoctorCandidates(@Param('appointmentId') appointmentId: string) {
    return this.candidateResolver.resolveDoctorCandidates(appointmentId);
  }

  @Get(':appointmentId/candidates/rooms')
  @ApiOperation({
    summary:
      'Mendapatkan kandidat ruangan yang tersedia untuk janji temu (Admin/Staf)',
    description:
      'Mengambil daftar ruangan klinik beserta status ketersediaannya pada jam janji temu ini.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
  })
  async getRoomCandidates(@Param('appointmentId') appointmentId: string) {
    return this.candidateResolver.resolveRoomCandidates(appointmentId);
  }

  @Patch(':appointmentId/doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mengubah dokter yang ditugaskan pada janji temu pasien (Admin/Staf)',
    description:
      'Mengalihkan janji temu ke dokter target secara transaksional dengan validasi bentrok jadwal dan resolusi sesi jadwal.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
  })
  async changeDoctor(
    @Param('appointmentId') appointmentId: string,
    @Body() body: ChangeAppointmentDoctorDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.assignmentService.changeDoctor(
      appointmentId,
      body.doctorId,
      {
        closeOldSchedule: body.closeOldSchedule,
        reason: body.reason,
      },
      user,
    );
    return {
      message: 'Dokter berhasil dialihkan',
      data: updated,
    };
  }

  @Patch(':appointmentId/room')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mengubah ruangan yang ditugaskan pada janji temu pasien (Admin/Staf)',
    description:
      'Mengalihkan ruangan janji temu secara transaksional dengan validasi ketersediaan ruangan.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
  })
  async changeRoom(
    @Param('appointmentId') appointmentId: string,
    @Body() body: ChangeAppointmentRoomDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.assignmentService.changeRoom(
      appointmentId,
      body.roomId,
      user,
    );
    return {
      message: 'Ruangan berhasil dialihkan',
      data: updated,
    };
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { AppointmentsService } from '../application/appointments.service';
import { AppointmentProposalService } from '../application/services/appointment-proposal.service';
import { AppointmentCheckInReminderService } from '../application/services/appointment-check-in-reminder.service';
import {
  CANDIDATE_ASSIGNMENT_PORT,
  type ICandidateAssignmentPort,
} from '../candidate-assignment/contracts/candidate-assignment.contract';
import {
  CANDIDATE_RESOLVER_PORT,
  type ICandidateResolverPort,
} from '../candidate-assignment/contracts/candidate-resolver.contract';
import { AdminUpdateAppointmentStatusDto } from './dto/admin-update-appointment-status.dto';
import { BulkAssignDoctorDto } from './dto/bulk-assign-doctor.dto';
import { BulkAssignRoomDto } from './dto/bulk-assign-room.dto';
import { BulkCancelAppointmentsDto } from './dto/bulk-cancel-appointments.dto';
import { BulkRescheduleAppointmentsDto } from './dto/bulk-reschedule-appointments.dto';
import { BulkProposeCancelDto } from './dto/bulk-propose-cancel.dto';
import { BulkProposeRescheduleDto } from './dto/bulk-propose-reschedule.dto';
import { BulkRevertProposalDto } from './dto/bulk-revert-proposal.dto';
import { RevertProposalDto } from './dto/revert-proposal.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { ChangeAppointmentDoctorDto } from './dto/change-appointment-doctor.dto';
import { ChangeAppointmentRoomDto } from './dto/change-appointment-room.dto';
import { ProposeCancellationDto } from './dto/propose-cancellation.dto';
import { ProposeRescheduleDto } from './dto/propose-reschedule.dto';
import { AppointmentDomainExceptionFilter } from './filters/appointment-domain-exception.filter';
import { RevertProposalUseCase } from '../application/use-cases/revert-proposal.use-case';

@ApiTags('Admin Appointments (Manajemen Janji Temu & Antrean)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@UseFilters(AppointmentDomainExceptionFilter)
@RequirePermissions('appointments:manage')
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Diperlukan izin appointments:manage',
})
@Controller({ path: 'admin/appointments', version: '1' })
export class AdminAppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly proposalService: AppointmentProposalService,
    @Inject(CANDIDATE_RESOLVER_PORT)
    private readonly candidateResolver: ICandidateResolverPort,
    @Inject(CANDIDATE_ASSIGNMENT_PORT)
    private readonly assignmentService: ICandidateAssignmentPort,
    private readonly reminderService: AppointmentCheckInReminderService,
    private readonly revertProposalUseCase: RevertProposalUseCase,
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
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: CancelAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
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
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: AdminUpdateAppointmentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
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
  async getDoctorCandidates(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
  ) {
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
  async getRoomCandidates(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
  ) {
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
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: ChangeAppointmentDoctorDto,
    @CurrentUser() user: AuthenticatedUser,
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
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: ChangeAppointmentRoomDto,
    @CurrentUser() user: AuthenticatedUser,
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

  @Post('reminders/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mengevaluasi dan mengirim pengingat check-in janji temu secara manual (Admin)',
    description:
      'Mengevaluasi seluruh janji temu aktif hari ini yang telah memasuki jendela check-in, dan memicu notifikasi berjenjang (Pasien, Dokter, Staf Umum) secara idempoten.',
  })
  @ApiOkResponse({
    description: 'Evaluasi pengingat check-in berhasil diproses',
  })
  async evaluateReminders(@Body() body?: { date?: string; currentTime?: string }) {
    const result = await this.reminderService.evaluateAndDispatchReminders(body);
    return {
      message: 'Evaluasi pengingat check-in berhasil dijalankan',
      data: result,
    };
  }

  @Post('bulk/assign-doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Menugaskan dokter secara massal ke sekumpulan janji temu (Admin/Staf)',
    description:
      'Menugaskan dokter target ke sekumpulan janji temu dan menyusun ulang antrean secara sekuensial.',
  })
  async bulkAssignDoctor(
    @Body() body: BulkAssignDoctorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.assignmentService.bulkChangeDoctor(
      body.appointmentIds,
      body.doctorId,
      {
        closeOldSchedule: body.closeOldSchedule,
        reason: body.reason,
      },
      user,
    );
    return {
      message: 'Operasi penugasan dokter massal selesai',
      data: result,
    };
  }

  @Post('bulk/assign-room')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Menugaskan ruangan secara massal ke sekumpulan janji temu (Admin/Staf)',
    description:
      'Menugaskan ruangan periksa target ke sekumpulan janji temu.',
  })
  async bulkAssignRoom(
    @Body() body: BulkAssignRoomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.assignmentService.bulkChangeRoom(
      body.appointmentIds,
      body.roomId,
      user,
    );
    return {
      message: 'Operasi penugasan ruangan massal selesai',
      data: result,
    };
  }

  @Post('bulk/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Membatalkan janji temu secara massal (Admin/Staf)',
    description: 'Membatalkan sekumpulan janji temu dan membebaskan antrean.',
  })
  async bulkCancel(
    @Body() body: BulkCancelAppointmentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.appointmentsService.bulkCancelAppointments(
      body.appointmentIds,
      body.reason,
      body.isNoShow,
      user,
    );
    return {
      message: 'Operasi pembatalan massal selesai',
      data: result,
    };
  }

  @Post('bulk/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Menjadwalkan ulang janji temu secara massal (Admin/Staf)',
    description:
      'Menjadwalkan ulang sekumpulan janji temu ke tanggal/sesi tujuan baru.',
  })
  async bulkReschedule(
    @Body() body: BulkRescheduleAppointmentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.appointmentsService.bulkRescheduleAppointments(
      body.appointmentIds,
      body,
      user,
    );
    return {
      message: 'Operasi penjadwalan ulang massal selesai',
      data: result,
    };
  }

  @Post('bulk/propose-reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Klinik mengajukan reschedule massal (Menunggu Persetujuan Pasien)',
  })
  async bulkProposeReschedule(
    @Body() body: BulkProposeRescheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const results = [];
    for (const id of body.appointmentIds) {
      try {
        const res = await this.proposalService.proposeReschedule(
          id,
          {
            targetDate: body.targetDate,
            targetSessionId: body.targetSessionId,
            targetDoctorId: body.targetDoctorId,
            targetRoomId: body.targetRoomId,
            reason: body.reason,
          },
          user,
        );
        results.push({ id, success: true, proposalId: res.proposalId });
      } catch (err: any) {
        results.push({ id, success: false, message: err.message });
      }
    }
    return {
      message: 'Pengajuan reschedule massal selesai diproses',
      data: results,
    };
  }

  @Post('bulk/propose-cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Klinik mengajukan pembatalan massal (Menunggu Persetujuan Pasien)',
  })
  async bulkProposeCancel(
    @Body() body: BulkProposeCancelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const results = [];
    for (const id of body.appointmentIds) {
      try {
        const res = await this.proposalService.proposeCancellation(
          id,
          { reason: body.reason },
          user,
        );
        results.push({ id, success: true, proposalId: res.proposalId });
      } catch (err: any) {
        results.push({ id, success: false, message: err.message });
      }
    }
    return {
      message: 'Pengajuan pembatalan massal selesai diproses',
      data: results,
    };
  }

  @Post(':appointmentId/propose-reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Klinik mengajukan reschedule janji temu (Menunggu Persetujuan Pasien)',
    description:
      'Membuat usulan pemindahan jadwal ke tanggal/sesi tujuan dan mengirim notifikasi actionable ke pasien.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
  })
  async proposeReschedule(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: ProposeRescheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalService.proposeReschedule(appointmentId, body, user);
  }

  @Post(':appointmentId/propose-cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Klinik mengajukan pembatalan janji temu (Menunggu Persetujuan Pasien)',
    description:
      'Membuat usulan pembatalan janji temu dan mengirim notifikasi actionable ke pasien.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
  })
  async proposeCancellation(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: ProposeCancellationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalService.proposeCancellation(appointmentId, body, user);
  }

  @Post('bulk/revert-proposal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Klinik membatalkan/revert persetujuan usulan massal (Admin/Staf)',
    description:
      'Mengembalikan janji temu ke jadwal atau status awal sebelum usulan disetujui.',
  })
  async bulkRevertProposal(
    @Body() body: BulkRevertProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.revertProposalUseCase.executeBulk(
      body.appointmentIds,
      body.reason,
      user,
    );
    return {
      message: 'Operasi pembatalan persetujuan (revert) massal selesai',
      data: result,
    };
  }

  @Post(':appointmentId/revert-proposal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Klinik membatalkan/revert persetujuan usulan janji temu (Admin/Staf)',
    description:
      'Mengembalikan janji temu tunggal ke jadwal atau status awal sebelum usulan disetujui.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'ID unik janji temu pasien (UUID)',
  })
  async revertProposal(
    @Param('appointmentId', new ParseUUIDPipe()) appointmentId: string,
    @Body() body: RevertProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revertProposalUseCase.execute(
      appointmentId,
      body.reason,
      user,
    );
  }

  @Get('proposals/pending')
  @ApiOperation({
    summary: 'Melihat seluruh pengajuan perubahan janji temu untuk pemantauan staf/admin',
  })
  async getAdminProposals(
    @Query('status') status?: string,
    @Query('date') date?: string,
  ) {
    return this.proposalService.getAdminProposals({ status, date });
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import {
  APPOINTMENT_REPOSITORY,
  AppointmentRepository,
} from '../domain/repositories/appointment.repository';
import { CurrentUser } from '../../../common/auth/current-user.decorator';

@ApiTags('Appointments (Kunjungan & Antrean Pasien)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: AppointmentRepository,
  ) {}

  @Post()
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({ summary: 'Pasien mendaftar kunjungan antrean (Web / Mobile App)' })
  async createAppointment(
    @Body()
    body: {
      patientId?: string;
      poliklinikId: string;
      layananId: string;
      appointmentDate: string;
      session: 'PAGI' | 'SIANG' | 'MALAM';
      visitType?: 'Pemeriksaan Baru' | 'Kontrol Ulang';
      complaint?: string;
    },
    @CurrentUser() user: any,
  ) {
    const patientId = body.patientId || user.patient?.id;
    const nextIndex = await this.appointmentRepo.getNextQueueIndex(
      body.poliklinikId,
      body.appointmentDate,
      body.session,
    );
    const prefix = body.session.charAt(0);
    const queueNumber = `${prefix}-${String(nextIndex).padStart(3, '0')}`;

    return this.appointmentRepo.create({
      patientId,
      poliklinikId: body.poliklinikId,
      layananId: body.layananId,
      appointmentDate: body.appointmentDate,
      session: body.session,
      queueNumber,
      status: 'SUDAH_BUAT_JANJI',
      visitType: body.visitType || 'Pemeriksaan Baru',
      complaint: body.complaint || null,
    });
  }

  @Get('queue/daily')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({ summary: 'Mendapatkan daftar antrean harian per poli dan sesi (Web/App)' })
  async getDailyQueue(
    @Query('poliklinikId') poliklinikId: string,
    @Query('date') date: string,
    @Query('session') session?: string,
  ) {
    return this.appointmentRepo.findDailyQueue(poliklinikId, date, session);
  }

  @Patch(':id/call')
  @Roles('STAF')
  @ApiOperation({ summary: 'Staf/Dokter memanggil pasien ke ruang periksa (Mobile App)' })
  async callPatient(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.appointmentRepo.updateStatus(id, 'SEDANG_DIPERIKSA', user.staff?.id);
  }

  @Patch(':id/complete')
  @Roles('STAF')
  @ApiOperation({ summary: 'Menyelesaikan pemeriksaan pasien (Mobile App)' })
  async completeAppointment(@Param('id') id: string) {
    return this.appointmentRepo.updateStatus(id, 'SELESAI');
  }
}

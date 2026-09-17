import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Public } from '../../../common/auth/public.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import {
  APPOINTMENT_REPOSITORY,
  AppointmentRepository,
} from '../domain/repositories/appointment.repository';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { QueryAppointmentDto } from './dto/query-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@ApiTags('Appointments (Kunjungan & Antrean Pasien)')
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: AppointmentRepository,
  ) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Pasien mendaftar kunjungan antrean (Web / Mobile App)',
  })
  @ApiResponse({
    status: 201,
    description: 'Janji temu berhasil dibuat beserta nomor tiket antrean',
  })
  async createAppointment(
    @Body() body: CreateAppointmentDto,
    @CurrentUser() user: any,
  ) {
    const patientId = body.patientId || user.patient?.id;
    if (!patientId) {
      throw new ForbiddenException(
        'Patient ID wajib disertakan atau akun harus terhubung ke data pasien',
      );
    }

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
      staffId: body.staffId,
      appointmentDate: body.appointmentDate,
      session: body.session,
      queueNumber,
      status: 'SUDAH_BUAT_JANJI',
      visitType: body.visitType || 'Pemeriksaan Baru',
      complaint: body.complaint || null,
    });
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Get()
  @ApiOperation({
    summary: 'Mendapatkan daftar seluruh janji temu dengan filter dan paginasi',
  })
  async getAppointments(@Query() query: QueryAppointmentDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    return this.appointmentRepo.findAll(limit, offset, {
      poliklinikId: query.poliklinikId,
      date: query.date,
      session: query.session,
      status: query.status,
      patientId: query.patientId,
    });
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Get('me')
  @ApiOperation({
    summary: 'Melihat riwayat janji temu dan antrean pasien saat ini',
  })
  async getMyAppointments(@CurrentUser() user: any) {
    const patientId = user.patient?.id;
    if (!patientId) {
      return [];
    }
    return this.appointmentRepo.findByPatientId(patientId);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Get('queue/daily')
  @ApiOperation({
    summary: 'Mendapatkan daftar antrean harian per poli dan sesi (Web/App)',
  })
  async getDailyQueue(
    @Query('poliklinikId') poliklinikId: string,
    @Query('date') date: string,
    @Query('session') session?: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.appointmentRepo.findDailyQueue(
      poliklinikId,
      targetDate,
      session,
    );
  }

  @Public()
  @Get('queue/display')
  @ApiOperation({
    summary:
      'Mendapatkan data display antrean TV ruang tunggu klinik (Real-time monitor)',
  })
  async getDisplayQueue(
    @Query('date') date?: string,
    @Query('poliklinikId') poliklinikId?: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.appointmentRepo.findDisplayQueue(targetDate, poliklinikId);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Get(':id')
  @ApiOperation({ summary: 'Mendapatkan detail janji temu dan tiket antrean' })
  async getAppointmentById(@Param('id') id: string) {
    const appointment = await this.appointmentRepo.findById(id);
    if (!appointment) {
      throw new NotFoundException(
        `Kunjungan/Janji temu dengan ID ${id} tidak ditemukan`,
      );
    }
    return appointment;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Patch(':id/check-in')
  @ApiOperation({
    summary: 'Pasien melakukan konfirmasi kedatangan di klinik (Check-in)',
  })
  async checkInAppointment(@Param('id') id: string) {
    const updated = await this.appointmentRepo.updateStatus(id, 'MENUNGGU');
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('STAF')
  @Patch(':id/call')
  @ApiOperation({
    summary: 'Staf/Dokter memanggil pasien ke ruang periksa (Mobile App)',
  })
  async callPatient(@Param('id') id: string, @CurrentUser() user: any) {
    const updated = await this.appointmentRepo.updateStatus(
      id,
      'SEDANG_DIPERIKSA',
      user.staff?.practitionerId || user.staff?.id,
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('STAF')
  @Patch(':id/complete')
  @ApiOperation({ summary: 'Menyelesaikan pemeriksaan pasien (Mobile App)' })
  async completeAppointment(@Param('id') id: string) {
    const updated = await this.appointmentRepo.updateStatus(id, 'SELESAI');
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Membatalkan janji temu antrean' })
  async cancelAppointment(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    const updated = await this.appointmentRepo.updateStatus(
      id,
      'BATAL',
      undefined,
      reason || 'Dibatalkan oleh pasien',
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Patch(':id/status')
  @ApiOperation({ summary: 'Memperbarui status janji temu secara spesifik' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateAppointmentStatusDto,
  ) {
    const updated = await this.appointmentRepo.updateStatus(
      id,
      body.status,
      undefined,
      body.cancellationReason,
    );
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Menghapus/Membatalkan data janji temu (Admin)' })
  async deleteAppointment(@Param('id') id: string) {
    const success = await this.appointmentRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
  }
}

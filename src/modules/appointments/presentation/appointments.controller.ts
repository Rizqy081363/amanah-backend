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
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
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

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Pasien mendaftar kunjungan antrean (Web / Mobile App)',
    description:
      'Membuat janji temu kunjungan poliklinik dan otomatis menerbitkan tiket nomor antrean sesuai sesi waktu.',
  })
  @ApiCreatedResponse({
    description: 'Janji temu berhasil dibuat beserta nomor tiket antrean',
  })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({
    description:
      'Patient ID wajib disertakan atau akun harus terhubung ke data pasien',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi jadwal poli atau tanggal kunjungan gagal',
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

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Get()
  @ApiOperation({
    summary: 'Mendapatkan daftar seluruh janji temu dengan filter dan paginasi',
    description:
      'Menampilkan seluruh antrean janji temu per poli, sesi, atau status kunjungan.',
  })
  @ApiOkResponse({ description: 'Daftar janji temu berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Admin atau Staf yang diizinkan' })
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

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Get('me')
  @ApiOperation({
    summary: 'Melihat riwayat janji temu dan antrean pasien saat ini',
    description:
      'Menampilkan riwayat kunjungan dan antrean aktif milik pasien yang sedang login.',
  })
  @ApiOkResponse({ description: 'Riwayat janji temu pasien berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  async getMyAppointments(@CurrentUser() user: any) {
    const patientId = user.patient?.id;
    if (!patientId) {
      return [];
    }
    return this.appointmentRepo.findByPatientId(patientId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Get('queue/daily')
  @ApiOperation({
    summary: 'Mendapatkan daftar antrean harian per poli dan sesi (Web/App)',
    description:
      'Digunakan oleh dokter dan perawat untuk memantau antrean harian di polikliniknya.',
  })
  @ApiOkResponse({ description: 'Daftar antrean harian berhasil diambil' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Admin atau Staf yang diizinkan' })
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
    summary: 'Mendapatkan data display antrean TV ruang tunggu klinik',
    description:
      'Endpoint publik real-time tanpa autentikasi untuk layar monitor TV ruang tunggu poliklinik.',
  })
  @ApiOkResponse({ description: 'Data antrean TV monitor berhasil diambil' })
  async getDisplayQueue(
    @Query('date') date?: string,
    @Query('poliklinikId') poliklinikId?: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.appointmentRepo.findDisplayQueue(targetDate, poliklinikId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Get(':id')
  @ApiOperation({
    summary: 'Mendapatkan detail janji temu dan tiket antrean',
    description:
      'Mengambil informasi lengkap jadwal janji temu, data poli, dokter penanggung jawab, dan status antrean.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan / appointment',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Detail janji temu berhasil ditemukan' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  async getAppointmentById(@Param('id') id: string) {
    const appointment = await this.appointmentRepo.findById(id);
    if (!appointment) {
      throw new NotFoundException(
        `Kunjungan/Janji temu dengan ID ${id} tidak ditemukan`,
      );
    }
    return appointment;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Patch(':id/check-in')
  @ApiOperation({
    summary: 'Pasien melakukan konfirmasi kedatangan di klinik (Check-in)',
    description:
      'Mengubah status antrean dari SUDAH_BUAT_JANJI menjadi MENUNGGU panggilan dokter.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Pasien berhasil check-in' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  async checkInAppointment(@Param('id') id: string) {
    const updated = await this.appointmentRepo.updateStatus(id, 'MENUNGGU');
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('STAF')
  @Patch(':id/call')
  @ApiOperation({
    summary: 'Staf/Dokter memanggil pasien ke ruang periksa (Mobile App)',
    description:
      'Mengubah status antrean menjadi SEDANG_DIPERIKSA dan memperbarui display antrean TV.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({
    description: 'Status berhasil diubah menjadi sedang diperiksa',
  })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Staf/Dokter yang diizinkan' })
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

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('STAF')
  @Patch(':id/complete')
  @ApiOperation({
    summary: 'Menyelesaikan pemeriksaan pasien (Mobile App)',
    description:
      'Mengubah status antrean menjadi SELESAI setelah dokter selesai mencatat rekam medis.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Pemeriksaan selesai' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Staf/Dokter yang diizinkan' })
  async completeAppointment(@Param('id') id: string) {
    const updated = await this.appointmentRepo.updateStatus(id, 'SELESAI');
    if (!updated) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Membatalkan janji temu antrean',
    description:
      'Membatalkan nomor antrean kunjungan dengan menyertakan alasan pembatalan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          example: 'Pasien berhalangan hadir karena keperluan mendesak',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Kunjungan berhasil dibatalkan' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
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

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Memperbarui status janji temu secara spesifik',
    description:
      'Mengubah status antrean ke status tertentu (MENUNGGU, SEDANG_DIPERIKSA, SELESAI, BATAL).',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Status kunjungan berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Admin atau Staf yang diizinkan' })
  @ApiUnprocessableEntityResponse({ description: 'Status baru tidak valid' })
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

  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus/Membatalkan data janji temu (Admin)',
    description:
      'Soft delete data janji temu dari sistem manajemen antrean klinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik kunjungan',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiNoContentResponse({ description: 'Janji temu berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Kunjungan tidak ditemukan' })
  @ApiUnauthorizedResponse({ description: 'Sesi token tidak valid' })
  @ApiForbiddenResponse({ description: 'Hanya Admin yang diizinkan' })
  async deleteAppointment(@Param('id') id: string) {
    const success = await this.appointmentRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Kunjungan dengan ID ${id} tidak ditemukan`);
    }
  }
}

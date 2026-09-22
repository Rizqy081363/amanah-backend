import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import {
  AdminDoctorScheduleDetailResponse,
  AdminDoctorScheduleListResponse,
} from '../domain/entities/schedule.entity';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { AdminDoctorScheduleDetailQueryDto } from './dto/admin-doctor-schedule-detail-query.dto';
import { AdminDoctorSchedulesQueryDto } from './dto/admin-doctor-schedules-query.dto';
import { CreateAdminDoctorSessionDto } from './dto/create-admin-doctor-session.dto';
import { UpdateAdminDayStatusDto } from './dto/update-admin-day-status.dto';
import { UpdateAdminDoctorScheduleDto } from './dto/update-admin-doctor-schedule.dto';
import { UpdateAdminDoctorSessionDto } from './dto/update-admin-doctor-session.dto';

@ApiTags('Admin Doctor Schedules (Supervisi Jadwal Dokter)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya administrator klinik yang berwenang',
})
@Controller({ path: 'admin/doctor-schedules', version: '1' })
export class AdminDoctorSchedulesController {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Mendapatkan daftar jadwal seluruh dokter untuk supervisi admin',
    description:
      'Menampilkan daftar dokter dengan agregasi kapasitas harian, sisa slot, status buka/penuh/cuti, dan filter poli/status/bulan.',
  })
  @ApiOkResponse({
    type: AdminDoctorScheduleListResponse,
    description: 'Daftar supervisi jadwal dokter berhasil diambil',
  })
  async getDoctorSchedules(@Query() query: AdminDoctorSchedulesQueryDto) {
    return this.scheduleRepo.findAdminDoctorSchedules(query);
  }

  @Get('filter-options')
  @ApiOperation({
    summary:
      'Mendapatkan master opsi referensi filter jadwal dokter (Poliklinik, Spesialisasi, Status)',
    description:
      'Menyediakan daftar poliklinik aktif, spesialisasi medis, dan pilihan status jadwal untuk dropdown filter admin dashboard.',
  })
  @ApiOkResponse({
    description: 'Daftar master opsi filter berhasil diambil',
  })
  async getFilterOptions() {
    return this.scheduleRepo.getAdminDoctorScheduleFilterOptions();
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Mendapatkan detail jadwal dokter, kalender bulanan, dan shift 24 jam',
    description:
      'Menampilkan detail lengkap jadwal dokter mencakup matriks kalender bulanan dan rincian sesi harian.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    type: AdminDoctorScheduleDetailResponse,
    description: 'Detail jadwal dokter dan kalender berhasil diambil',
  })
  @ApiNotFoundResponse({
    description: 'Dokter tidak ditemukan',
  })
  async getDoctorScheduleDetail(
    @Param('id') id: string,
    @Query() query: AdminDoctorScheduleDetailQueryDto,
  ) {
    return this.scheduleRepo.findAdminDoctorScheduleDetail(id, query);
  }

  @Put(':id')
  @Patch(':id')
  @ApiOperation({
    summary: 'Memperbarui operasional jadwal dan status cuti dokter (Admin)',
    description:
      'Menetapkan atau membatalkan cuti darurat, mengatur kapasitas pasien, slot, atau menutup praktik hari ini.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Operasional jadwal dokter berhasil diperbarui',
  })
  @ApiNotFoundResponse({
    description: 'Dokter tidak ditemukan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form pembaruan jadwal gagal',
  })
  async updateDoctorSchedule(
    @Param('id') id: string,
    @Body() body: UpdateAdminDoctorScheduleDto,
  ) {
    return this.scheduleRepo.updateAdminDoctorSchedule(id, body);
  }

  @Patch(':id/days/:date')
  @ApiOperation({
    summary: 'Menyesuaikan status praktik untuk tanggal kalender tertentu',
    description:
      'Override status satu hari kalender menjadi Buka, Penuh, Cuti, atau Tutup beserta catatan operasional.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiParam({
    name: 'date',
    description: 'Tanggal kalender spesifik (format YYYY-MM-DD)',
    example: '2026-09-22',
  })
  @ApiOkResponse({
    description: 'Status hari kalender dokter berhasil disesuaikan',
  })
  @ApiNotFoundResponse({
    description: 'Dokter tidak ditemukan',
  })
  async updateDayStatus(
    @Param('id') id: string,
    @Param('date') date: string,
    @Body() body: UpdateAdminDayStatusDto,
  ) {
    return this.scheduleRepo.updateAdminDayStatus(
      id,
      date,
      body.status,
      body.notes,
    );
  }

  @Patch(':id/day-status')
  @ApiOperation({
    summary:
      'Menyesuaikan status praktik tanggal kalender melalui payload body (Admin)',
    description:
      'Override status satu hari kalender via body payload (date, status, notes/reason).',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Status hari kalender dokter berhasil disesuaikan',
  })
  @ApiNotFoundResponse({
    description: 'Dokter tidak ditemukan',
  })
  async updateDayStatusByBody(
    @Param('id') id: string,
    @Body() body: UpdateAdminDayStatusDto & { date?: string; reason?: string },
  ) {
    const targetDate = body.date || new Date().toISOString().slice(0, 10);
    return this.scheduleRepo.updateAdminDayStatus(
      id,
      targetDate,
      body.status,
      body.notes || body.reason,
    );
  }

  @Post(':id/sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan sesi shift praktik baru untuk dokter (Admin)',
    description:
      'Menambahkan sesi shift periksa (Pagi, Siang, Malam, Dini Hari) untuk lonjakan antrean atau jam tambahan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiCreatedResponse({
    description: 'Sesi jadwal baru berhasil ditambahkan',
  })
  @ApiNotFoundResponse({
    description: 'Dokter tidak ditemukan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi waktu atau konflik ruangan/dokter terdeteksi',
  })
  async createSession(
    @Param('id') id: string,
    @Body() body: CreateAdminDoctorSessionDto,
  ) {
    return this.scheduleRepo.createAdminDoctorSession(id, body);
  }

  @Patch(':id/sessions/:sessionId')
  @ApiOperation({
    summary: 'Memperbarui sesi shift praktik dokter (Admin)',
    description:
      'Mengubah jam mulai/selesai, kuota pasien, sisa slot, status sesi, atau ruangan praktik untuk sesi tertentu.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter',
  })
  @ApiOkResponse({
    description: 'Sesi jadwal praktik berhasil diperbarui',
  })
  @ApiNotFoundResponse({
    description: 'Dokter atau sesi jadwal tidak ditemukan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form atau konflik waktu/ruangan terdeteksi',
  })
  async updateSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateAdminDoctorSessionDto,
  ) {
    return this.scheduleRepo.updateAdminDoctorSession(id, sessionId, body);
  }

  @Delete(':id/sessions/:sessionId')
  @ApiOperation({
    summary: 'Menghapus sesi shift praktik dokter (Admin)',
    description:
      'Menghapus sesi shift jika salah input atau shift dibatalkan. Menolak penghapusan jika sudah ada janji temu pasien aktif.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter',
  })
  @ApiOkResponse({
    description: 'Sesi jadwal praktik berhasil dihapus',
  })
  @ApiNotFoundResponse({
    description: 'Dokter atau sesi jadwal tidak ditemukan',
  })
  async deleteSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.scheduleRepo.deleteAdminDoctorSession(id, sessionId);
  }
}

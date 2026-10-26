import { CurrentUser } from '@common/auth/current-user.decorator';
import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { Roles } from '@common/auth/roles.decorator';
import { RolesGuard } from '@common/auth/roles.guard';
import { HttpCache } from '@common/decorators/http-cache.decorator';
import { RedisService } from '@common/redis/redis.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
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
import { SYSTEM_ROLES } from '../../../auth/constants/auth.constants';
import {
  STAFF_REPOSITORY,
  StaffRepository,
} from '../../staffs/domain/repositories/staff.repository';
import { UpdateStaffDto } from '../../staffs/presentation/dto/update-staff.dto';
import {
  AdminDoctorAccumulatedPatientsResponse,
  AdminDoctorScheduleDetailResponse,
  AdminDoctorScheduleListResponse,
  AdminSessionPatientsResponse,
  RescheduleEligibilityResponse,
} from '../domain/entities/schedule.entity';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { AdminDoctorScheduleDetailQueryDto } from './dto/admin-doctor-schedule-detail-query.dto';
import { AdminDoctorSchedulesQueryDto } from './dto/admin-doctor-schedules-query.dto';
import { CheckRescheduleEligibilityQueryDto } from './dto/check-reschedule-eligibility-query.dto';
import { CreateAdminDoctorSessionDto } from './dto/create-admin-doctor-session.dto';
import { GetAdminDoctorPatientsQueryDto } from './dto/get-admin-doctor-patients-query.dto';
import { GetSessionPatientsQueryDto } from './dto/get-session-patients-query.dto';
import { RescheduleAdminDoctorSessionDto } from './dto/reschedule-admin-doctor-session.dto';
import { UpdateAdminDayStatusDto } from './dto/update-admin-day-status.dto';
import { UpdateAdminDoctorScheduleDto } from './dto/update-admin-doctor-schedule.dto';
import { UpdateAdminDoctorSessionDto } from './dto/update-admin-doctor-session.dto';

@ApiTags('Admin Doctor Schedules (Supervisi Jadwal Dokter)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Hanya administrator atau dokter terkait yang berwenang',
})
@Controller({ path: 'admin/doctor-schedules', version: '1' })
export class AdminDoctorSchedulesController {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
    @Inject(STAFF_REPOSITORY)
    private readonly staffRepo: StaffRepository,
    @Optional()
    @Inject(RedisService)
    private readonly redisService?: RedisService,
  ) {}

  private async invalidateScheduleCaches(): Promise<void> {
    if (!this.redisService) return;
    try {
      await this.redisService.invalidateTags(
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'booking',
      );
    } catch {
      // safe fallback
    }
  }

  private assertDoctorAccess(targetPractitionerId: string, user?: any) {
    if (!user || user.systemRole === SYSTEM_ROLES.ADMIN) return;
    const doctorPractitionerId = user.staff?.practitionerId;
    if (
      !doctorPractitionerId ||
      doctorPractitionerId !== targetPractitionerId
    ) {
      throw new ForbiddenException(
        'Akses ditolak: Anda hanya berwenang mengakses data jadwal dokter Anda sendiri',
      );
    }
  }

  @Get()
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Mendapatkan daftar jadwal seluruh dokter untuk supervisi admin',
    description:
      'Menampilkan daftar dokter dengan status buka/cuti/tutup dan filter poli/status/bulan.',
  })
  @ApiOkResponse({
    type: AdminDoctorScheduleListResponse,
    description: 'Daftar supervisi jadwal dokter berhasil diambil',
  })
  @HttpCache({
    ttlSeconds: 30,
    isPrivate: false,
    tags: ['schedule', 'schedule:list'],
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
  @HttpCache({ ttlSeconds: 300, isPrivate: false, tags: ['schedule:ref'] })
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
  @HttpCache({
    ttlSeconds: 20,
    isPrivate: false,
    tags: ['schedule', 'schedule:detail'],
  })
  async getDoctorScheduleDetail(
    @Param('id') id: string,
    @Query() query: AdminDoctorScheduleDetailQueryDto,
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    return this.scheduleRepo.findAdminDoctorScheduleDetail(id, query);
  }

  @Get(':id/profile')
  @ApiOperation({
    summary:
      'Mendapatkan data profil onboarding lengkap dokter / bidan (Admin)',
    description:
      'Mengambil informasi profil, identitas KTP, kelahiran, domisili, poliklinik, dan kredensial SIP/STR dokter atau bidan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID praktisi atau ID profil staf dokter/bidan',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Data profil dokter berhasil ditemukan',
  })
  @ApiNotFoundResponse({
    description: 'Dokter tidak ditemukan',
  })
  async getDoctorProfile(@Param('id') id: string, @CurrentUser() user?: any) {
    this.assertDoctorAccess(id, user);
    const profile = await this.staffRepo.findById(id);
    if (!profile) {
      throw new NotFoundException(
        `Profil dokter dengan ID ${id} tidak ditemukan`,
      );
    }
    return profile;
  }

  @Patch(':id/profile')
  @ApiOperation({
    summary:
      'Memperbarui data profil dan status operasional dokter / bidan (Admin)',
    description:
      'Memperbarui data identitas, domisili, kredensial klinis, dan status aktif/non-aktif dokter atau bidan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID praktisi atau ID profil staf dokter/bidan',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    description: 'Profil dokter berhasil diperbarui',
  })
  @ApiNotFoundResponse({
    description: 'Dokter tidak ditemukan',
  })
  async updateDoctorProfile(
    @Param('id') id: string,
    @Body() body: UpdateStaffDto,
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    const updated = await this.staffRepo.update(id, body);
    if (!updated) {
      throw new NotFoundException(
        `Gagal memperbarui profil dokter dengan ID ${id}`,
      );
    }
    await this.invalidateScheduleCaches();
    return updated;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Memperbarui operasional jadwal dan status cuti dokter (Admin)',
    description:
      'Menetapkan atau membatalkan cuti darurat atau menutup praktik hari ini.',
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
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    const result = await this.scheduleRepo.updateAdminDoctorSchedule(id, body);
    await this.invalidateScheduleCaches();
    return result;
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Memperbarui operasional jadwal dan status cuti dokter via PUT (Admin)',
    description:
      'Menetapkan atau membatalkan cuti darurat atau menutup praktik hari ini.',
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
  async updateDoctorSchedulePut(
    @Param('id') id: string,
    @Body() body: UpdateAdminDoctorScheduleDto,
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    const result = await this.scheduleRepo.updateAdminDoctorSchedule(id, body);
    await this.invalidateScheduleCaches();
    return result;
  }

  @Patch(':id/days/:date')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary: 'Menyesuaikan status praktik untuk tanggal kalender tertentu',
    description:
      'Override status satu hari kalender menggunakan canonical status OPEN atau CLOSED. Cuti bukan status jadwal; gunakan metadata cuti.',
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
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    const result = await this.scheduleRepo.updateAdminDayStatus(
      id,
      date,
      body.status,
      body.reason,
    );
    await this.invalidateScheduleCaches();
    return result;
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
    @Body() body: UpdateAdminDayStatusDto,
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    if (!body.date) {
      throw new BadRequestException('Tanggal dinas (date) wajib disertakan');
    }
    const result = await this.scheduleRepo.updateAdminDayStatus(
      id,
      body.date,
      body.status,
      body.reason,
    );
    await this.invalidateScheduleCaches();
    return result;
  }

  @Post(':id/sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Menambahkan sesi shift praktik baru untuk dokter (Admin & Dokter)',
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
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    const result = await this.scheduleRepo.createAdminDoctorSession(id, body);
    await this.invalidateScheduleCaches();
    return result;
  }

  @Patch(':id/sessions/:sessionId')
  @ApiOperation({
    summary: 'Memperbarui sesi shift praktik dokter (Admin & Dokter)',
    description:
      'Mengubah jam mulai/selesai, status sesi, atau ruangan praktik untuk sesi tertentu.',
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
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    const result = await this.scheduleRepo.updateAdminDoctorSession(
      id,
      sessionId,
      body,
    );
    await this.invalidateScheduleCaches();
    return result;
  }

  @Get(':id/sessions/:sessionId/reschedule-eligibility')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
  @ApiOperation({
    summary:
      'Pengecekan pra-syarat (eligibility pre-check) sebelum reschedule sesi dokter (Admin & Dokter)',
    description:
      'Memeriksa apakah sesi asal eligible untuk di-reschedule (menolak sesi CLOSED dan tanggal cuti). Jika parameter target (targetDate, targetStartTime, targetRoomId) disertakan, backend melakukan simulasi validasi konflik, cuti target, dan batas shift tanpa mengubah data.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter yang akan diperiksa',
    example: '8489be4c-7c05-4c07-b352-7bf579b29cb1',
  })
  @ApiOkResponse({
    type: RescheduleEligibilityResponse,
    description: 'Hasil evaluasi kelayakan reschedule sesi berhasil didapatkan',
  })
  @ApiNotFoundResponse({
    description: 'Dokter atau sesi jadwal tidak ditemukan',
  })
  async checkRescheduleEligibility(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Query() query: CheckRescheduleEligibilityQueryDto,
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    const result = await this.scheduleRepo.checkRescheduleEligibility(
      id,
      sessionId,
      query,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Post(':id/sessions/:sessionId/reschedule')
  @Roles(SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.STAF)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Menjadwalkan ulang (reschedule) sesi shift praktik dokter ke tanggal/jam baru (Admin & Dokter)',
    description:
      'Memindahkan seluruh sesi jadwal praktik dokter ke tanggal dan jam baru dengan kalkulasi projection otomatis, validasi batas shift & durasi konsultasi, pencegahan konflik jadwal/ruangan, serta sinkronisasi otomatis janji temu pasien aktif.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter yang akan di-reschedule',
  })
  @ApiOkResponse({
    description: 'Sesi jadwal praktik dokter berhasil di-reschedule',
  })
  @ApiNotFoundResponse({
    description: 'Dokter atau sesi jadwal tidak ditemukan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form gagal atau jam mulai di luar batas shift',
  })
  async rescheduleSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() body: RescheduleAdminDoctorSessionDto,
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    const result = await this.scheduleRepo.rescheduleAdminDoctorSession(
      id,
      sessionId,
      body,
    );
    await this.invalidateScheduleCaches();
    return result;
  }

  @Delete(':id/sessions/:sessionId')
  @Roles(SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Penghapusan sesi jadwal dokter oleh Admin (Dinonaktifkan demi Integritas Data)',
    description:
      'Penghapusan jadwal dokter oleh admin dilarang untuk menjaga jejak audit klinis dan riwayat rekam medis. Endpoint ini menolak penghapusan (403 Forbidden). Admin disarankan melakukan Reschedule atau mengubah status menjadi CLOSED.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter',
  })
  @ApiForbiddenResponse({
    description:
      'Penghapusan jadwal dilarang. Gunakan update status atau reschedule.',
  })
  async deleteSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.scheduleRepo.deleteAdminDoctorSession(id, sessionId);
  }

  @Get(':id/sessions/:sessionId/patients')
  @ApiOperation({
    summary:
      'Mendapatkan daftar pasien terdaftar pada sesi shift tertentu dokter (5-Kolom Grid & Demografis)',
    description:
      'Menampilkan data pasien terdaftar (nama, keluhan, ruangan, jam/nomor antrean, status, data demografis NIK/RM/alamat/wali lengkap, dan booking metadata) untuk modal showcase 5-kolom dan sub-modal detail.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'ID unik sesi shift jadwal dokter',
    example: '8489be4c-7c05-4c07-b352-7bf579b29cb1',
  })
  @ApiOkResponse({
    type: AdminSessionPatientsResponse,
    description: 'Daftar pasien terdaftar pada sesi berhasil diambil',
  })
  @ApiNotFoundResponse({
    description: 'Dokter atau sesi jadwal tidak ditemukan',
  })
  @HttpCache({
    ttlSeconds: 15,
    isPrivate: false,
    tags: ['schedule:patients', 'appointments'],
  })
  async getSessionPatients(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Query() query: GetSessionPatientsQueryDto,
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    return this.scheduleRepo.getAdminSessionPatients(id, sessionId, query);
  }

  @Get(':id/patients')
  @ApiOperation({
    summary:
      'Mendapatkan akumulasi daftar seluruh pasien dokter pada tanggal tertentu (4 Sesi)',
    description:
      'Menampilkan daftar pasien dan antrean per sesi pada tanggal yang dipilih.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik dokter / praktisi medis',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOkResponse({
    type: AdminDoctorAccumulatedPatientsResponse,
    description: 'Daftar akumulasi pasien dokter berhasil diambil',
  })
  @ApiNotFoundResponse({
    description: 'Dokter tidak ditemukan',
  })
  @HttpCache({
    ttlSeconds: 15,
    isPrivate: false,
    tags: ['schedule:patients', 'appointments'],
  })
  async getDoctorPatientsByDate(
    @Param('id') id: string,
    @Query() query: GetAdminDoctorPatientsQueryDto,
    @CurrentUser() user?: any,
  ) {
    this.assertDoctorAccess(id, user);
    return this.scheduleRepo.getAdminDoctorPatientsByDate(
      id,
      query.date,
      query,
    );
  }
}

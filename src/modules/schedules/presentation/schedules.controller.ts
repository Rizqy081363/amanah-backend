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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ScheduleOccupancyOverviewResponse } from '../domain/entities/schedule.entity';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { BookedPatientsQueryDto } from './dto/booked-patients-query.dto';
import { CalendarSummaryQueryDto } from './dto/calendar-summary-query.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { GetDaySettingQueryDto } from './dto/get-day-setting-query.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { RoomReferenceQueryDto } from './dto/room-reference-query.dto';
import { ScheduleContextQueryDto } from './dto/schedule-context-query.dto';
import { ScheduleOccupancyQueryDto } from './dto/schedule-occupancy-query.dto';
import { ScheduleProjectionQueryDto } from './dto/schedule-projection-query.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { UpsertDaySettingDto } from './dto/upsert-day-setting.dto';

@ApiTags('Schedules (Jadwal Dokter & Bidan)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Peran akun tidak memiliki wewenang untuk aksi ini',
})
@Controller({ path: 'schedules', version: '1' })
export class SchedulesController {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
  ) {}

  private assertScheduleOwnership(schedule: any, user: any) {
    if (user.systemRole === 'ADMIN') return;
    const userStaffId = user.staff?.practitionerId || user.staff?.id;
    if (
      !userStaffId ||
      (schedule.staffId !== userStaffId &&
        schedule.staffId !== user.staff?.id &&
        schedule.staffId !== user.staff?.practitionerId)
    ) {
      throw new ForbiddenException(
        'Akses ditolak: Anda hanya berwenang mengelola jadwal praktek Anda sendiri',
      );
    }
  }

  private resolveTargetStaffId(user: any, requestedStaffId?: string): string {
    const userStaffId = user.staff?.practitionerId || user.staff?.id;
    if (user.systemRole === 'ADMIN') {
      const targetId = requestedStaffId || userStaffId;
      if (!targetId) {
        throw new ForbiddenException(
          'Parameter staffId wajib disertakan ketika diakses oleh akun Administrator non-praktisi',
        );
      }
      return targetId;
    }
    if (!userStaffId) {
      throw new ForbiddenException('User bukan staf atau praktisi terdaftar');
    }
    if (
      requestedStaffId &&
      requestedStaffId !== userStaffId &&
      requestedStaffId !== user.staff?.id &&
      requestedStaffId !== user.staff?.practitionerId
    ) {
      throw new ForbiddenException(
        'Akses ditolak: Staf hanya dapat mengakses jadwal untuk akun sendiri',
      );
    }
    return userStaffId;
  }

  @Post()
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan jadwal jaga/praktek staf (Admin/Staf)',
    description:
      'Membuat slot jadwal praktek dokter/bidan pada tanggal dan sesi tertentu dengan batas kuota pasien.',
  })
  @ApiCreatedResponse({
    description: 'Jadwal praktek berhasil dibuat',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi waktu atau kuota jadwal gagal',
  })
  async createSchedule(
    @Body() body: CreateScheduleDto,
    @CurrentUser() user: any,
  ) {
    let staffId: string;
    if (user.systemRole === 'ADMIN') {
      staffId = body.staffId || user.staff?.practitionerId || user.staff?.id;
    } else {
      staffId = user.staff?.practitionerId || user.staff?.id;
      if (
        body.staffId &&
        body.staffId !== staffId &&
        body.staffId !== user.staff?.id &&
        body.staffId !== user.staff?.practitionerId
      ) {
        throw new ForbiddenException(
          'Akses ditolak: Staf hanya dapat membuat jadwal praktek untuk akun sendiri',
        );
      }
    }
    if (!staffId) {
      throw new ForbiddenException(
        'Akun Anda belum terhubung dengan profil staf atau praktisi medis klinik',
      );
    }

    const sessionValue: 'PAGI' | 'SIANG' | 'MALAM' =
      body.session ||
      (body.sessionType?.toUpperCase() === 'SIANG'
        ? 'SIANG'
        : body.sessionType?.toUpperCase() === 'MALAM'
          ? 'MALAM'
          : 'PAGI');

    return this.scheduleRepo.create({
      staffId,
      poliklinikId: body.poliklinikId,
      roomId: body.roomId,
      serviceId: body.serviceId,
      dayOfWeek: null,
      specificDate: body.date || body.specificDate,
      scheduleDate: body.date || body.specificDate,
      session: sessionValue,
      sessionLabel: body.sessionType || body.session,
      startTime: body.startTime,
      endTime: body.endTime,
      capacity: body.capacity ?? 8,
      isAvailable: body.isAvailable ?? true,
      notes: body.notes,
    });
  }

  @Get()
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan daftar seluruh jadwal praktek dengan filter',
    description:
      'Mengambil jadwal praktek berdasarkan poliklinik, staf dokter, atau tanggal tertentu dengan pagination.',
  })
  @ApiOkResponse({
    description: 'Daftar jadwal praktek berhasil diambil',
  })
  async getSchedules(@Query() query: QueryScheduleDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    return this.scheduleRepo.findAll(limit, offset, {
      poliklinikId: query.poliklinikId,
      staffId: query.staffId,
      date: query.date,
    });
  }

  @Get('my-schedules')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Melihat jadwal staf yang sedang login (Mobile App / Web)',
    description:
      'Menampilkan seluruh jadwal dinas dokter atau bidan yang sedang terautentikasi.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter tanggal spesifik (YYYY-MM-DD)',
    example: '2026-08-26',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter tanggal awal rentang (YYYY-MM-DD)',
    example: '2026-08-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter tanggal akhir rentang (YYYY-MM-DD)',
    example: '2026-08-31',
  })
  @ApiOkResponse({
    description: 'Daftar jadwal dinas staf login berhasil diambil',
  })
  async getMySchedules(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const staffId = user.staff?.practitionerId || user.staff?.id;
    if (!staffId) {
      throw new ForbiddenException('User bukan staf atau praktisi terdaftar');
    }
    return this.scheduleRepo.findMySchedules(staffId, {
      date,
      startDate,
      endDate,
    });
  }

  @Get('calendar-summary')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Melihat ringkasan kalender bulanan jadwal dokter (Mobile App)',
    description:
      'Mengambil status jadwal, status cuti, dan akumulasi pasien untuk setiap hari dalam satu bulan.',
  })
  @ApiOkResponse({
    description: 'Ringkasan kalender bulanan berhasil diambil',
  })
  async getCalendarSummary(
    @Query() query: CalendarSummaryQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = user.staff?.practitionerId || user.staff?.id;
    if (!staffId) {
      throw new ForbiddenException('User bukan staf atau praktisi terdaftar');
    }
    return this.scheduleRepo.getCalendarSummary(staffId, query.month);
  }

  @Get('day-settings')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Melihat pengaturan target kuota dan cuti harian dokter',
    description:
      'Mengambil pengaturan harian jadwal dokter (target kuota pasien, status cuti, dan persentase kapasitas).',
  })
  @ApiOkResponse({
    description: 'Pengaturan jadwal harian berhasil diambil',
  })
  async getDaySettings(
    @Query() query: GetDaySettingQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = user.staff?.practitionerId || user.staff?.id;
    if (!staffId) {
      throw new ForbiddenException('User bukan staf atau praktisi terdaftar');
    }
    return this.scheduleRepo.getDaySettings(staffId, query.date);
  }

  @Put('day-settings')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary:
      'Menyimpan atau memperbarui pengaturan kuota dan cuti harian dokter',
    description:
      'Menetapkan target kuota pasien per hari atau mengaktifkan status cuti dokter pada tanggal tertentu.',
  })
  @ApiOkResponse({
    description: 'Pengaturan jadwal harian berhasil diperbarui',
  })
  async updateDaySettings(
    @Body() body: UpsertDaySettingDto,
    @CurrentUser() user: any,
  ) {
    const staffId = user.staff?.practitionerId || user.staff?.id;
    if (!staffId) {
      throw new ForbiddenException('User bukan staf atau praktisi terdaftar');
    }
    return this.scheduleRepo.upsertDaySettings(staffId, body.date, {
      targetQuota: body.targetQuota,
      isCuti: body.isCuti,
      cutiReason: body.cutiReason,
      userId: user.id,
    });
  }

  @Patch('days/:date')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary:
      'Menutup atau membuka seluruh jadwal pada hari/tanggal tertentu (Mobile & Web Staf)',
    description:
      'Dokter atau staf dapat menonaktifkan (CLOSED) atau mengaktifkan kembali (OPEN) seluruh sesi pada tanggal kalender tertentu secara cascading.',
  })
  @ApiParam({
    name: 'date',
    description: 'Tanggal kalender target (YYYY-MM-DD)',
    example: '2026-10-24',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['OPEN', 'CLOSED'],
          example: 'CLOSED',
          description: 'Canonical operating status for the day',
        },
        notes: {
          type: 'string',
          nullable: true,
          example: 'Dokter berhalangan hadir',
          description: 'Catatan alasan penutupan hari',
        },
      },
      required: ['status'],
    },
  })
  @ApiOkResponse({
    description: 'Status hari berhasil diperbarui dan sesi di-cascade',
  })
  async updateDayStatus(
    @Param('date') date: string,
    @Body('status') status: string,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user);
    return this.scheduleRepo.updateAdminDayStatus(staffId, date, status, notes);
  }

  @Get('reference/rooms')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan daftar ruang praktek klinik dan status okupansi',
    description:
      'Mengambil seluruh ruangan periksa klinik aktif beserta informasi ketersediaan atau dokter yang sedang menempati.',
  })
  @ApiOkResponse({
    description: 'Daftar ruangan klinik berhasil diambil',
  })
  async getRooms(@Query() query: RoomReferenceQueryDto) {
    return this.scheduleRepo.getRooms(
      query.date,
      query.startTime,
      query.endTime,
    );
  }

  @Get('reference/polikliniks')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan daftar unit poliklinik aktif untuk referensi jadwal',
    description:
      'Mengambil seluruh unit poliklinik aktif sebagai opsi pilihan poliklinik pada form jadwal dokter.',
  })
  @ApiOkResponse({
    description: 'Daftar poliklinik aktif berhasil diambil',
  })
  async getPolikliniks() {
    return this.scheduleRepo.getPolikliniks();
  }

  @Get(['reference/options', 'options'])
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary:
      'Mendapatkan opsi konfigurasi referensi jadwal dokter (shifts, status, time intervals)',
    description:
      'Mengambil master shift praktek, status sesi, dan interval durasi waktu yang berlaku di klinik untuk dropdown dinamis di mobile dan web.',
  })
  @ApiOkResponse({
    description: 'Opsi referensi jadwal berhasil diambil',
  })
  async getScheduleOptions() {
    return this.scheduleRepo.getScheduleOptions();
  }

  @Get('contexts')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Mendapatkan konteks jadwal dan durasi efektif dokter',
    description:
      'Mengembalikan konteks praktik backend-owned beserta batas waktu, presisi start, dan durasi konsultasi efektif.',
  })
  @ApiOkResponse({
    description: 'Konteks jadwal berhasil diambil',
  })
  async getScheduleContexts(
    @Query() query: ScheduleContextQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user, query.staffId);
    return this.scheduleRepo.getScheduleContexts(
      staffId,
      query.date,
      user.systemRole === 'ADMIN',
    );
  }

  @Get('projection')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Preview projection interval dari start time dokter',
    description:
      'Memproyeksikan interval availability dari start time arbitrary tanpa membulatkan jam mulai.',
  })
  @ApiOkResponse({
    description: 'Projection availability berhasil dihitung',
  })
  async previewScheduleProjection(
    @Query() query: ScheduleProjectionQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user, query.staffId);
    return this.scheduleRepo.projectAvailability(
      staffId,
      query,
      user.systemRole === 'ADMIN',
    );
  }

  @Get('occupancy-overview')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary:
      'Melihat ringkasan okupansi slot jadwal per shift (Anti-Collision Grid)',
    description:
      'Menampilkan status ketersediaan setiap slot konsultasi di seluruh 4 shift (dini hari, pagi, siang, malam) untuk mencegah bentrok jadwal dokter atau ruangan sebelum submit.',
  })
  @ApiOkResponse({
    description: 'Ringkasan okupansi slot berhasil diambil',
    type: ScheduleOccupancyOverviewResponse,
  })
  async getOccupancyOverview(
    @Query() query: ScheduleOccupancyQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user, query.staffId);
    const data = await this.scheduleRepo.getOccupancyOverview(staffId, query);
    return {
      success: true,
      data,
    };
  }

  @Post('availability')
  @Roles('STAF', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Membuat availability dokter tanpa input endTime manual',
    description:
      'Menerima tanggal, konteks jadwal, dan startTime. Backend menghitung endTime, kapasitas, dan interval canonical.',
  })
  @ApiCreatedResponse({
    description: 'Availability berhasil dibuat beserta projection canonical',
  })
  async createAvailability(
    @Body() body: CreateAvailabilityDto,
    @CurrentUser() user: any,
  ) {
    const staffId = this.resolveTargetStaffId(user, body.staffId);

    return this.scheduleRepo.createAvailability(staffId, body, {
      userId: user.id,
      durationEditableByCurrentUser: user.systemRole === 'ADMIN',
    });
  }

  @Get('booked-patients')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Melihat daftar pasien terdaftar dokter berdasarkan tanggal',
    description:
      'Mengambil seluruh pasien yang telah mendaftar pada sesi praktek dokter yang login untuk tanggal tertentu.',
  })
  @ApiOkResponse({
    description: 'Daftar pasien terdaftar berhasil diambil',
  })
  async getBookedPatientsByDate(
    @Query() query: BookedPatientsQueryDto,
    @CurrentUser() user: any,
  ) {
    const staffId = user.staff?.practitionerId || user.staff?.id;
    if (!staffId) {
      throw new ForbiddenException('User bukan staf atau praktisi terdaftar');
    }
    return this.scheduleRepo.getBookedPatients(undefined, query.date, staffId);
  }

  @Get('poli/:poliklinikId')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Melihat jadwal dokter/bidan aktif di poliklinik tertentu',
    description:
      'Mengambil daftar jadwal dokter yang membuka praktek pada unit poliklinik dan tanggal yang diminta.',
  })
  @ApiParam({
    name: 'poliklinikId',
    description: 'ID unik poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Tanggal praktek (YYYY-MM-DD)',
    example: '2026-09-17',
  })
  @ApiOkResponse({
    description: 'Daftar jadwal poliklinik berhasil diambil',
  })
  async getByPoli(
    @Param('poliklinikId') poliklinikId: string,
    @Query('date') date: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.scheduleRepo.findByPoliAndDate(poliklinikId, targetDate);
  }

  @Get(':id/booked-patients')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Melihat daftar pasien yang terdaftar pada satu sesi jadwal',
    description:
      'Mengambil seluruh pasien yang telah memesan janji temu untuk sesi praktek spesifik ini.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik sesi jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiOkResponse({
    description: 'Daftar pasien terdaftar pada sesi ini berhasil diambil',
  })
  async getBookedPatientsForSession(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    this.assertScheduleOwnership(schedule, user);
    return this.scheduleRepo.getBookedPatients(id);
  }

  @Get(':id')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan detail jadwal berdasarkan ID',
    description: 'Mengambil informasi lengkap satu jadwal dinas staf.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiOkResponse({ description: 'Detail jadwal ditemukan' })
  @ApiNotFoundResponse({ description: 'Jadwal tidak ditemukan' })
  async getScheduleById(@Param('id') id: string) {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    return schedule;
  }

  @Patch(':id/availability')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Mengaktifkan / menonaktifkan ketersediaan jadwal staf',
    description:
      'Mengaktifkan atau menonaktifkan kuota penerimaan janji temu pasien pada jadwal terkait.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        isAvailable: {
          type: 'boolean',
          example: true,
          description: 'Status ketersediaan jadwal',
        },
      },
      required: ['isAvailable'],
    },
  })
  @ApiOkResponse({
    description: 'Status ketersediaan jadwal berhasil diperbarui',
  })
  @ApiNotFoundResponse({ description: 'Jadwal tidak ditemukan' })
  async toggleAvailability(
    @Param('id') id: string,
    @Body('isAvailable') isAvailable: boolean,
    @CurrentUser() user: any,
  ) {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    this.assertScheduleOwnership(existing, user);

    const updated = await this.scheduleRepo.toggleAvailability(id, isAvailable);
    if (!updated) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @Patch(':id')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Memperbarui informasi jadwal praktek',
    description:
      'Mengubah jam mulai, jam selesai, kuota kapasitas, ruangan, atau catatan jadwal praktek.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiOkResponse({ description: 'Jadwal berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Jadwal tidak ditemukan' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi perubahan jadwal gagal',
  })
  async updateSchedule(
    @Param('id') id: string,
    @Body() body: UpdateScheduleDto,
    @CurrentUser() user: any,
  ) {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    this.assertScheduleOwnership(existing, user);

    const updated = await this.scheduleRepo.update(id, {
      session: body.session,
      sessionLabel: body.sessionType || body.session,
      startTime: body.startTime,
      endTime: body.endTime,
      capacity: body.capacity,
      roomId: body.roomId,
      poliklinikId: body.poliklinikId,
      serviceId: body.serviceId,
      status: body.status,
      isAvailable: body.isAvailable,
      notes: body.notes,
    });
    if (!updated) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @Delete(':id')
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus jadwal staf (Admin / Staf Dokter)',
    description:
      'Menghapus slot jadwal praktek dokter dari sistem dengan perlindungan booking aktif.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik jadwal praktek',
    example: '67212c38-ca4a-45f8-b9bc-ebe2fd82b0a1',
  })
  @ApiNoContentResponse({ description: 'Jadwal berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Jadwal tidak ditemukan' })
  async deleteSchedule(@Param('id') id: string, @CurrentUser() user: any) {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    this.assertScheduleOwnership(existing, user);

    const success = await this.scheduleRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
  }
}

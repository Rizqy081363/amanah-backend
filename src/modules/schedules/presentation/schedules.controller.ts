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
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { BookedPatientsQueryDto } from './dto/booked-patients-query.dto';
import { CalendarSummaryQueryDto } from './dto/calendar-summary-query.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { GetDaySettingQueryDto } from './dto/get-day-setting-query.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { RoomReferenceQueryDto } from './dto/room-reference-query.dto';
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
    const staffId =
      body.staffId || user.staff?.practitionerId || user.staff?.id;
    if (!staffId) {
      throw new ForbiddenException(
        'Staff ID wajib disertakan atau akun harus terhubung dengan staf/praktisi terdaftar',
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
    summary: 'Menyimpan atau memperbarui pengaturan kuota dan cuti harian dokter',
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
    return this.scheduleRepo.getBookedPatients(
      undefined,
      query.date,
      staffId,
    );
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
  async getBookedPatientsForSession(@Param('id') id: string) {
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
      'Buka atau tutup kuota penerimaan janji temu pasien pada jadwal terkait.',
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
  ) {
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
  ) {
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
  async deleteSchedule(@Param('id') id: string) {
    const success = await this.scheduleRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
  }
}

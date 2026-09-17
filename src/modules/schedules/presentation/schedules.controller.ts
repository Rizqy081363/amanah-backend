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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@ApiTags('Schedules (Jadwal Dokter & Bidan)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'), RolesGuard)
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
    const staffId = body.staffId || user.staff?.id;
    if (!staffId) {
      throw new ForbiddenException('Staff ID wajib disertakan');
    }

    return this.scheduleRepo.create({
      staffId,
      poliklinikId: body.poliklinikId,
      dayOfWeek: null,
      specificDate: body.specificDate,
      session: body.session,
      startTime: body.startTime,
      endTime: body.endTime,
      capacity: body.capacity || 20,
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
  @Roles('STAF')
  @ApiOperation({
    summary: 'Melihat jadwal staf yang sedang login (Mobile App)',
    description:
      'Menampilkan seluruh jadwal dinas dokter atau bidan yang sedang terautentikasi.',
  })
  @ApiOkResponse({
    description: 'Daftar jadwal dinas staf login berhasil diambil',
  })
  async getMySchedules(@CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }
    return this.scheduleRepo.findByStaffId(user.staff.id);
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
      'Mengubah jam mulai, jam selesai, kuota kapasitas, atau catatan jadwal praktek.',
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
    const updated = await this.scheduleRepo.update(id, body);
    if (!updated) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus jadwal staf (Admin)',
    description: 'Menghapus slot jadwal praktek dokter dari sistem.',
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

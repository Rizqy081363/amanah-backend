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
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
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
  })
  @ApiResponse({ status: 201, description: 'Jadwal berhasil dibuat' })
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
  @ApiOperation({ summary: 'Mendapatkan detail jadwal berdasarkan ID' })
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
  })
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
  @ApiOperation({ summary: 'Memperbarui informasi jadwal praktek' })
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
  @ApiOperation({ summary: 'Menghapus jadwal staf' })
  async deleteSchedule(@Param('id') id: string) {
    const success = await this.scheduleRepo.delete(id);
    if (!success) {
      throw new NotFoundException(`Jadwal dengan ID ${id} tidak ditemukan`);
    }
  }
}

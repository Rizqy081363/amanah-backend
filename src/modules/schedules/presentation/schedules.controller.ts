import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { CurrentUser } from '../../../common/auth/current-user.decorator';

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
  @ApiOperation({ summary: 'Menambahkan jadwal jaga/praktek staf' })
  async createSchedule(
    @Body()
    body: {
      staffId?: string;
      dayOfWeek?: number;
      specificDate?: string;
      session: 'PAGI' | 'SIANG' | 'MALAM';
      notes?: string;
    },
    @CurrentUser() user: any,
  ) {
    const staffId = body.staffId || user.staff?.id;
    if (!staffId) {
      throw new ForbiddenException('Staff ID wajib disertakan');
    }

    return this.scheduleRepo.create({
      staffId,
      dayOfWeek: body.dayOfWeek,
      specificDate: body.specificDate,
      session: body.session,
      isAvailable: true,
      notes: body.notes,
    });
  }

  @Get('my-schedules')
  @Roles('STAF')
  @ApiOperation({ summary: 'Melihat jadwal staf yang sedang login (Mobile App)' })
  async getMySchedules(@CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }
    return this.scheduleRepo.findByStaffId(user.staff.id);
  }

  @Get('poli/:poliklinikId')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({ summary: 'Melihat jadwal dokter/bidan aktif di poliklinik tertentu' })
  async getByPoli(
    @Param('poliklinikId') poliklinikId: string,
    @Query('date') date: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.scheduleRepo.findByPoliAndDate(poliklinikId, targetDate);
  }

  @Patch(':id/availability')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({ summary: 'Mengaktifkan / menonaktifkan ketersediaan jadwal staf' })
  async toggleAvailability(
    @Param('id') id: string,
    @Body('isAvailable') isAvailable: boolean,
  ) {
    return this.scheduleRepo.toggleAvailability(id, isAvailable);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Menghapus jadwal staf' })
  async deleteSchedule(@Param('id') id: string) {
    return this.scheduleRepo.delete(id);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
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
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../domain/repositories/attendance.repository';
import { CurrentUser } from '../../../common/auth/current-user.decorator';

@ApiTags('Attendance (Presensi QR Staf)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'attendance', version: '1' })
export class AttendanceController {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly attendanceRepo: AttendanceRepository,
  ) {}

  @Post('scan')
  @Roles('STAF')
  @ApiOperation({ summary: 'Staf melakukan scan QR Code presensi kehadiran (Mobile App)' })
  async scanQr(
    @Body()
    body: {
      shift: 'PAGI' | 'SIANG' | 'MALAM';
      qrToken: string;
      deviceInfo?: string;
    },
    @CurrentUser() user: any,
  ) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }

    // Simulasi verifikasi qrToken (misal token valid jika berawalan AMANAH-PRESENSI)
    // dan penentuan status HADIR vs TERLAMBAT
    return this.attendanceRepo.recordScan({
      staffId: user.staff.id,
      shift: body.shift,
      status: 'HADIR',
      deviceInfo: body.deviceInfo,
    });
  }

  @Get('my-history')
  @Roles('STAF')
  @ApiOperation({ summary: 'Melihat riwayat presensi staf yang sedang login (Mobile App)' })
  async getMyHistory(@CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }
    return this.attendanceRepo.findByStaffId(user.staff.id);
  }

  @Get('daily')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin memantau presensi harian seluruh staf (Web Dashboard)' })
  async getDailyAttendance(@Query('date') date: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.attendanceRepo.findDaily(targetDate);
  }
}

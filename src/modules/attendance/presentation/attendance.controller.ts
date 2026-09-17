import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../domain/repositories/attendance.repository';
import { ScanQrDto } from './dto/scan-qr.dto';

@ApiTags('Attendance (Presensi QR Staf)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya staf atau admin yang diizinkan',
})
@Controller({ path: 'attendance', version: '1' })
export class AttendanceController {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly attendanceRepo: AttendanceRepository,
  ) {}

  @Post('scan')
  @Roles('STAF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Staf melakukan scan QR Code presensi kehadiran (Mobile App)',
    description:
      'Mencatat jam masuk/pulang dinas staf berdasarkan token QR dinamis yang ditampilkan di terminal klinik.',
  })
  @ApiCreatedResponse({ description: 'Presensi staf berhasil dicatat' })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  @ApiUnprocessableEntityResponse({
    description: 'Format token QR atau sesi shift tidak valid',
  })
  async scanQr(@Body() body: ScanQrDto, @CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }

    return this.attendanceRepo.recordScan({
      staffId: user.staff.id,
      shift: body.shift,
      status: 'HADIR',
      deviceInfo: body.deviceInfo,
    });
  }

  @Get('my-history')
  @Roles('STAF')
  @ApiOperation({
    summary: 'Melihat riwayat presensi staf yang sedang login (Mobile App)',
    description:
      'Mengambil rekapitulasi kehadiran pribadi staf medis selama periode dinas.',
  })
  @ApiOkResponse({ description: 'Riwayat presensi staf berhasil diambil' })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  async getMyHistory(@CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }
    return this.attendanceRepo.findByStaffId(user.staff.id);
  }

  @Get('daily')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Admin memantau presensi harian seluruh staf (Web Dashboard)',
    description:
      'Dashboard rekapitulasi kehadiran tenaga medis dan staf klinik per tanggal dinas.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Tanggal rekapitulasi presensi (YYYY-MM-DD)',
    example: '2026-09-17',
  })
  @ApiOkResponse({
    description: 'Daftar presensi harian staf berhasil diambil',
  })
  async getDailyAttendance(@Query('date') date: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.attendanceRepo.findDaily(targetDate);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  HybridAuthGuard,
  isAdminUser,
  isStaffUser,
  Roles,
  RolesGuard,
} from '../../../common/auth';
import {
  DomainForbiddenException,
} from '../../../common/exceptions';
import { zodPipe } from '../../../common/validation';
import { CheckOutAttendanceUseCase } from '../application/use-cases/checkout-attendance.use-case';
import { GetAttendanceExportCandidatesUseCase } from '../application/use-cases/get-attendance-export-candidates.use-case';
import { GetDailyAttendanceBffUseCase } from '../application/use-cases/get-daily-attendance-bff.use-case';
import { ManualAttendanceUseCase } from '../application/use-cases/manual-attendance.use-case';
import { RotateQrSessionUseCase } from '../application/use-cases/rotate-qr-session.use-case';
import { ScanAttendanceUseCase } from '../application/use-cases/scan-attendance.use-case';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../domain/repositories/attendance.repository';
import {
  type AttendanceQueryInput,
  AttendanceQuerySchema,
} from './dto/attendance-query.schema';
import {
  type CheckOutInput,
  CheckOutSchema,
} from './dto/checkout.schema';
import {
  type ManualAttendanceInput,
  ManualAttendanceSchema,
} from './dto/manual-attendance.schema';
import {
  type RotateQrInput,
  RotateQrSchema,
} from './dto/rotate-qr.schema';
import {
  type ScanQrInput,
  ScanQrSchema,
} from './dto/scan-qr.schema';

@ApiTags('Attendance (Presensi QR & Manual Staf)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya staf atau admin yang diizinkan',
})
@Controller({ path: 'attendance', version: '1' })
export class AttendanceController {
  constructor(
    private readonly scanAttendanceUseCase: ScanAttendanceUseCase,
    private readonly manualAttendanceUseCase: ManualAttendanceUseCase,
    private readonly checkOutAttendanceUseCase: CheckOutAttendanceUseCase,
    private readonly rotateQrSessionUseCase: RotateQrSessionUseCase,
    private readonly getDailyAttendanceBffUseCase: GetDailyAttendanceBffUseCase,
    private readonly getAttendanceExportCandidatesUseCase: GetAttendanceExportCandidatesUseCase,
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly attendanceRepo: AttendanceRepository,
  ) {}

  @Post('scan')
  @Roles('STAF', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Staf melakukan scan QR Code presensi kehadiran (Mobile App)',
    description:
      'Mencatat jam masuk dinas staf berdasarkan token QR dinamis yang ditampilkan di terminal klinik.',
  })
  @ApiCreatedResponse({ description: 'Presensi staf berhasil dicatat' })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  @ApiUnprocessableEntityResponse({
    description: 'Format token QR atau sesi shift tidak valid',
  })
  async scanQr(
    @Body(zodPipe(ScanQrSchema)) body: ScanQrInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!isStaffUser(user)) {
      throw new DomainForbiddenException(
        'User bukan staf atau tenaga medis terdaftar',
      );
    }

    return this.scanAttendanceUseCase.execute({
      staffId: user.staff.id,
      qrToken: body.qrToken,
      method: body.method as any,
      shift: body.shift,
      sessionId: body.sessionId,
      deviceInfo: body.deviceInfo,
    });
  }

  @Post('manual')
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Admin atau staf mencatat presensi kehadiran secara manual',
    description:
      'Memproses kehadiran staf via kode staf atau ID staf secara langsung.',
  })
  @ApiCreatedResponse({ description: 'Presensi manual berhasil dicatat' })
  async recordManual(
    @Body(zodPipe(ManualAttendanceSchema)) body: ManualAttendanceInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.manualAttendanceUseCase.execute({
      staffIdOrCode: body.staffIdOrCode,
      shift: body.shift,
      status: body.status,
      attendanceDate: body.attendanceDate,
      notes: body.notes,
      recordedBy: user.id,
    });
  }

  @Post('checkout')
  @Roles('STAF', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Staf atau admin melakukan presensi pulang dinas / checkout',
    description:
      'Mencatat jam checkout dinas dan menghitung durasi kerja tervalidasi.',
  })
  @ApiOkResponse({ description: 'Presensi pulang dinas berhasil dicatat' })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  async checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(CheckOutSchema)) body: CheckOutInput,
  ) {
    const isAdmin = isAdminUser(user);
    const isStaff = isStaffUser(user);

    let targetStaffId: string;
    let isAdministrativeEntry = false;

    if (isAdmin && body.staffId) {
      targetStaffId = body.staffId;
      isAdministrativeEntry = true;
    } else if (isStaff) {
      targetStaffId = user.staff.id;
      isAdministrativeEntry = false;
    } else {
      throw new DomainForbiddenException(
        'User bukan staf terdaftar atau staffId target wajib disertakan untuk admin.',
      );
    }

    return this.checkOutAttendanceUseCase.execute({
      staffId: targetStaffId,
      attendanceDate: body.attendanceDate,
      qrToken: body.qrToken,
      method: body.method as any,
      notes: body.notes,
      checkoutTicket: body.checkoutTicket,
      isAdministrativeEntry,
    });
  }

  @Post('qr/rotate')
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Terminal klinik meminta rotasi QR token presensi baru',
    description:
      'Menghasilkan token kode presensi 6-karakter acak dan menyimpannya di database.',
  })
  @ApiOkResponse({ description: 'Token QR baru berhasil dibuat' })
  async rotateQr(
    @Body(zodPipe(RotateQrSchema)) body: RotateQrInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rotateQrSessionUseCase.execute({
      sessionType: body.sessionType,
      shift: body.shift,
      rotationSeconds: body.rotationSeconds,
      context: body.context,
      createdBy: user.id,
    });
  }

  @Get('qr/active')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Mengambil informasi sesi QR aktif saat ini untuk terminal',
  })
  @ApiOkResponse({ description: 'Sesi QR aktif berhasil diambil' })
  async getActiveQr() {
    return this.rotateQrSessionUseCase.getActiveSession();
  }

  @Get('my-history')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Melihat riwayat presensi staf yang sedang login (Mobile App)',
    description:
      'Mengambil rekapitulasi kehadiran pribadi staf medis selama periode dinas beserta metrik tervalidasi.',
  })
  @ApiOkResponse({
    description: 'Riwayat presensi staf dan ringkasan metrik berhasil diambil',
  })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  async getMyHistory(@CurrentUser() user: AuthenticatedUser) {
    if (!isStaffUser(user)) {
      throw new DomainForbiddenException('User bukan staf terdaftar');
    }
    return this.attendanceRepo.findHistoryWithSummaryByStaffId(user.staff.id);
  }

  @Get('daily')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Admin memantau presensi harian seluruh staf (Web Dashboard BFF)',
    description:
      'Dashboard rekapitulasi kehadiran tenaga medis dan staf klinik per tanggal dinas dengan metrik pra-kalkulasi.',
  })
  @ApiOkResponse({
    description:
      'Daftar presensi harian staf dan ringkasan metrik berhasil diambil',
  })
  async getDailyAttendance(
    @Query(zodPipe(AttendanceQuerySchema)) query: AttendanceQueryInput,
  ) {
    return this.getDailyAttendanceBffUseCase.execute(query);
  }

  @Get('export-candidates')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Daftar staf dan rekap total kehadiran bulanan untuk wizard ekspor',
    description:
      'Mengambil daftar staf aktif beserta spesialisasi dan total presensi pada bulan target untuk modalitas ekspor berkas.',
  })
  @ApiOkResponse({
    description: 'Daftar kandidat ekspor staf berhasil diambil',
  })
  async getExportCandidates(@Query('month') month?: string) {
    return this.getAttendanceExportCandidatesUseCase.execute(month);
  }
}

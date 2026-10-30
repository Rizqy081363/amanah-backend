import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/auth';
import { DomainForbiddenException } from '../../../common/exceptions';
import { zodPipe } from '../../../common/validation';
import {
  CheckOutAttendanceUseCase,
  GetAttendanceExportCandidatesUseCase,
  GetDailyAttendanceBffUseCase,
  GetMyAttendanceHistoryUseCase,
  ManualAttendanceUseCase,
  RotateQrSessionUseCase,
  ScanAttendanceUseCase,
} from '../application/use-cases';
import {
  type AttendanceQueryInput,
  AttendanceQuerySchema,
  type CheckOutInput,
  CheckOutSchema,
  type ManualAttendanceInput,
  ManualAttendanceSchema,
  type RotateQrInput,
  RotateQrSchema,
  type ScanQrInput,
  ScanQrSchema,
} from './schemas';

@ApiTags('Attendance (Presensi QR & Manual Staf)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
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
    private readonly getMyAttendanceHistoryUseCase: GetMyAttendanceHistoryUseCase,
    private readonly getDailyAttendanceBffUseCase: GetDailyAttendanceBffUseCase,
    private readonly getAttendanceExportCandidatesUseCase: GetAttendanceExportCandidatesUseCase,
  ) {}

  @Post('scan')
  @RequirePermissions('attendance:submit')
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
      method: body.method,
      shift: body.shift,
      sessionId: body.sessionId,
      deviceInfo: body.deviceInfo,
    });
  }

  @Post('manual')
  @RequirePermissions('attendance:approve', 'attendance:manage')
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
  @RequirePermissions('attendance:submit')
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

    // Explicitly distinguish self-service checkout from administrative intervention (Standing Rule #5)
    if (body.staffId && (!isStaff || body.staffId !== user.staff?.id)) {
      const canManage =
        isAdmin ||
        user.permissions?.includes('attendance:manage') ||
        user.permissions?.includes('*');
      if (!canManage) {
        throw new DomainForbiddenException(
          'Hanya supervisor atau pengelola presensi yang dapat mencatat kepulangan staf lain.',
        );
      }
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
      method: body.method,
      notes: body.notes,
      checkoutTicket: body.checkoutTicket,
      isAdministrativeEntry,
    });
  }

  @Post('qr/rotate')
  @RequirePermissions('attendance:manage')
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
  @RequirePermissions('attendance:submit', 'attendance:read', 'attendance:manage')
  @ApiOperation({
    summary: 'Mengambil informasi sesi QR aktif saat ini untuk terminal',
  })
  @ApiOkResponse({ description: 'Sesi QR aktif berhasil diambil' })
  async getActiveQr() {
    const active = await this.rotateQrSessionUseCase.getActiveSessionOrNull();
    if (!active) {
      return {
        isActive: false,
        status: 'inactive',
        message: 'Tidak ada sesi operasional klinik yang aktif saat ini',
      };
    }
    return active;
  }

  @Get('my-history')
  @RequirePermissions('attendance:read')
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
    return this.getMyAttendanceHistoryUseCase.execute(user.staff.id);
  }

  @Get('daily')
  @RequirePermissions('attendance:review', 'attendance:manage')
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
  @RequirePermissions('attendance:review', 'attendance:manage')
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

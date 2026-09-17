import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBadRequestResponse,
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
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Idempotent } from '../../../common/decorators/idempotent.decorator';
import {
  LEAVE_REPOSITORY,
  LeaveRepository,
} from '../domain/repositories/leave.repository';
import { RequestLeaveDto } from './dto/request-leave.dto';
import { ReviewLeaveDto } from './dto/review-leave.dto';

@ApiTags('Staff Leaves (Perizinan Cuti Staf)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya staf atau admin yang berwenang',
})
@Controller({ path: 'leaves', version: '1' })
export class LeavesController {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  @Post()
  @Roles('STAF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Staf mengajukan permohonan cuti / izin (Mobile App)',
    description:
      'Mengajukan permohonan izin atau cuti kerja dengan melampirkan tanggal, alasan, dan berkas surat pendukung opsional.',
  })
  @ApiCreatedResponse({ description: 'Permohonan cuti berhasil diajukan' })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi rentang tanggal atau alasan cuti gagal',
  })
  @Idempotent()
  async requestLeave(@Body() body: RequestLeaveDto, @CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }

    return this.leaveRepo.create({
      staffId: user.staff.id,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
      type: body.type,
      substituteStaffId: body.substituteStaffId,
      documentUrl: body.documentUrl,
    });
  }

  @Get('my-leaves')
  @Roles('STAF')
  @ApiOperation({
    summary: 'Melihat riwayat pengajuan cuti staf login (Mobile App)',
    description:
      'Menampilkan seluruh status pengajuan permohonan cuti staf (MENUNGGU, DISETUJUI, DITOLAK).',
  })
  @ApiOkResponse({
    description: 'Daftar permohonan cuti staf berhasil diambil',
  })
  @ApiForbiddenResponse({ description: 'User bukan staf terdaftar' })
  async getMyLeaves(@CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }
    return this.leaveRepo.findByStaffId(user.staff.id);
  }

  @Get('pending')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Admin melihat daftar pengajuan cuti yang butuh persetujuan (Web Dashboard)',
    description:
      'Menampilkan seluruh pengajuan izin staf dengan status MENUNGGU untuk ditinjau oleh Admin/SDM.',
  })
  @ApiOkResponse({
    description: 'Daftar permohonan cuti pending berhasil diambil',
  })
  @ApiForbiddenResponse({ description: 'Hanya Admin yang diizinkan' })
  async getPendingLeaves() {
    return this.leaveRepo.findAllPending();
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Admin menyetujui atau menolak cuti staf (Web Dashboard)',
    description:
      'Memperbarui status permohonan cuti staf menjadi DISETUJUI atau DITOLAK dengan menyertakan catatan persetujuan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik permohonan cuti',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Status cuti berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Permohonan cuti tidak ditemukan' })
  @ApiForbiddenResponse({ description: 'Hanya Admin yang diizinkan' })
  @ApiUnprocessableEntityResponse({
    description: 'Keputusan status tidak valid',
  })
  async reviewLeave(
    @Param('id') id: string,
    @Body() body: ReviewLeaveDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.leaveRepo.updateStatus(
      id,
      body.status,
      user.id,
      body.approvalNotes,
    );
    if (!updated) {
      throw new NotFoundException(
        `Pengajuan cuti dengan ID ${id} tidak ditemukan`,
      );
    }
    return updated;
  }

  @Patch(':id/cancel')
  @Roles('STAF')
  @ApiOperation({
    summary:
      'Staf membatalkan pengajuan cuti sendiri yang masih pending (Mobile App)',
    description:
      'Membatalkan permohonan cuti yang telah diajukan sebelum disetujui atau ditolak oleh Admin.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik permohonan cuti',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Pengajuan cuti berhasil dibatalkan' })
  @ApiNotFoundResponse({ description: 'Pengajuan cuti tidak ditemukan' })
  @ApiForbiddenResponse({
    description: 'Akses ditolak atau bukan milik staf login',
  })
  @ApiBadRequestResponse({
    description: 'Hanya pengajuan cuti berstatus pending yang dapat dibatalkan',
  })
  async cancelLeave(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }

    const updated = await this.leaveRepo.cancel(id, user.staff.id);
    if (!updated) {
      throw new NotFoundException(
        `Pengajuan cuti dengan ID ${id} tidak ditemukan`,
      );
    }
    return updated;
  }
}

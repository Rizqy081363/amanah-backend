import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  HybridAuthGuard,
  Roles,
  RolesGuard,
  SYSTEM_ROLES,
} from '../../../common/auth';
import { StaffInvitationService } from '../application/staff-invitation.service';
import { InviteDoctorDto } from './dto/invite-doctor.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';

@ApiTags('Admin Staff & Doctor Invitations')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(SYSTEM_ROLES.ADMIN)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Hanya administrator yang dapat mengelola undangan',
})
@Controller({ path: 'admin/invitations', version: '1' })
export class AdminInvitationsController {
  constructor(
    private readonly staffInvitationService: StaffInvitationService,
  ) {}

  @Post('doctor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Undang dokter baru ke poliklinik (Admin)',
    description:
      'Membuat akun dokter, menetapkan peran staff_doctor, menghubungkan ke poliklinik, membuat praktisi medis, dan mengirim email kredensial login via Mailpit.',
  })
  @ApiCreatedResponse({
    description: 'Undangan dokter berhasil dibuat dan email terkirim',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Data dokter atau email tidak valid',
  })
  async inviteDoctor(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteDoctorDto) {
    return this.staffInvitationService.inviteDoctor(dto, user.id);
  }

  @Post('staff')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Undang staf operasional atau bidan independen baru (Admin)',
    description:
      'Membuat akun staf/bidan operasional (bebas dari ikatan dokter), menetapkan peran, dan mengirim email kredensial login via Mailpit.',
  })
  @ApiCreatedResponse({
    description: 'Undangan staf berhasil dibuat dan email terkirim',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Data staf atau email tidak valid',
  })
  async inviteStaff(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteStaffDto) {
    return this.staffInvitationService.inviteStaff(dto, user.id);
  }

  @Get('options')
  @ApiOperation({
    summary: 'Mendapatkan opsi dinamis form undangan (Peran Praktisi & Poliklinik)',
    description:
      'Mengambil daftar peran klinis praktisi medis dan poliklinik aktif langsung dari database.',
  })
  @ApiOkResponse({
    description: 'Opsi form undangan berhasil diambil',
  })
  async getInvitationOptions() {
    return this.staffInvitationService.getInvitationOptions();
  }

  @Get()
  @ApiOperation({
    summary: 'Mendapatkan daftar seluruh undangan staf/dokter',
    description:
      'Mengambil histori dan status undangan: pending, accepted, expired, atau revoked.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter berdasarkan status undangan',
    enum: ['pending', 'accepted', 'expired', 'revoked'],
  })
  @ApiOkResponse({
    description: 'Daftar undangan berhasil diambil',
  })
  async listInvitations(@Query('status') status?: string) {
    return this.staffInvitationService.listInvitations(status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Membatalkan (revoke) undangan staf/dokter',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik undangan',
  })
  @ApiOkResponse({
    description: 'Undangan berhasil dibatalkan',
  })
  async revokeInvitation(@Param('id') id: string) {
    return this.staffInvitationService.revokeInvitation(id);
  }
}

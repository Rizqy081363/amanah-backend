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
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/auth';
import { StaffInvitationService } from '../application/staff-invitation.service';
import { InviteStaffUniversalDto } from './dto/invite-staff-universal.dto';

@ApiTags('Admin Staff Invitations')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Pengguna tidak memiliki izin untuk mengelola undangan staf',
})
@Controller({ path: 'admin/invitations', version: '1' })
export class AdminInvitationsController {
  constructor(
    private readonly staffInvitationService: StaffInvitationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('staff:invite')
  @ApiOperation({
    summary: 'Undang staf atau praktisi medis baru (Universal)',
    description:
      'Mengundang staf atau praktisi baru berbasis pilihan roleId dari database. Secara otomatis membuat entitas praktisi jika peran bersifat klinis.',
  })
  @ApiCreatedResponse({
    description: 'Undangan berhasil dibuat dan email terkirim',
  })
  async inviteUniversal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteStaffUniversalDto,
  ) {
    return this.staffInvitationService.inviteStaffUniversal(dto, user.id);
  }

  @Get('options')
  @RequirePermissions('staff:invite')
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
  @RequirePermissions('staff:read')
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
  @RequirePermissions('staff:manage')
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

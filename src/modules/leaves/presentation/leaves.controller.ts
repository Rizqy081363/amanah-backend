import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import {
  LEAVE_REPOSITORY,
  LeaveRepository,
} from '../domain/repositories/leave.repository';
import { CurrentUser } from '../../../common/auth/current-user.decorator';

@ApiTags('Staff Leaves (Perizinan Cuti Staf)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'leaves', version: '1' })
export class LeavesController {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  @Post()
  @Roles('STAF')
  @ApiOperation({ summary: 'Staf mengajukan permohonan cuti / izin (Mobile App)' })
  async requestLeave(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      reason: string;
      documentUrl?: string;
    },
    @CurrentUser() user: any,
  ) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }

    return this.leaveRepo.create({
      staffId: user.staff.id,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
      documentUrl: body.documentUrl,
    });
  }

  @Get('my-leaves')
  @Roles('STAF')
  @ApiOperation({ summary: 'Melihat riwayat pengajuan cuti staf login (Mobile App)' })
  async getMyLeaves(@CurrentUser() user: any) {
    if (!user.staff?.id) {
      throw new ForbiddenException('User bukan staf terdaftar');
    }
    return this.leaveRepo.findByStaffId(user.staff.id);
  }

  @Get('pending')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin melihat daftar pengajuan cuti yang butuh persetujuan (Web Dashboard)' })
  async getPendingLeaves() {
    return this.leaveRepo.findAllPending();
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Admin menyetujui atau menolak cuti staf (Web Dashboard)' })
  async reviewLeave(
    @Param('id') id: string,
    @Body()
    body: {
      status: 'DISETUJUI' | 'DITOLAK';
      approvalNotes?: string;
    },
    @CurrentUser() user: any,
  ) {
    return this.leaveRepo.updateStatus(
      id,
      body.status,
      user.id,
      body.approvalNotes,
    );
  }
}

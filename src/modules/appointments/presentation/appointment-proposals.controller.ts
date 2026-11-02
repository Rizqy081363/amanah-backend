import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { AppointmentProposalService } from '../application/services/appointment-proposal.service';
import { RespondProposalDto } from './dto/respond-proposal.dto';

@ApiTags('Appointment Proposals (Persetujuan Pasien)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard)
@Controller({ path: 'appointments/proposals', version: '1' })
export class AppointmentProposalsController {
  constructor(
    private readonly proposalService: AppointmentProposalService,
  ) {}

  @Post(':proposalId/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pasien merespons pengajuan perubahan/pembatalan jadwal (Setuju / Tolak)',
    description:
      'Menerima persetujuan atau penolakan pasien atas pengajuan reschedule atau pembatalan dari klinik secara atomik.',
  })
  @ApiParam({
    name: 'proposalId',
    description: 'ID unik pengajuan perubahan janji temu (UUID)',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({
    description: 'Keputusan pasien berhasil diproses',
  })
  async respondToProposal(
    @Param('proposalId') proposalId: string,
    @Body() body: RespondProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalService.respondToProposal(proposalId, body, user);
  }

  @Get('my-pending')
  @ApiOperation({
    summary: 'Mendapatkan daftar pengajuan perubahan jadwal yang menunggu persetujuan pasien ini',
  })
  @ApiOkResponse({
    description: 'Daftar pengajuan pending berhasil diambil',
  })
  async getMyPendingProposals(@CurrentUser() user: AuthenticatedUser) {
    return this.proposalService.getMyPendingProposals(user.id);
  }
}

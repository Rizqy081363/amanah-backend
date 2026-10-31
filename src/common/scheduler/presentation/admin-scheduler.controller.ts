import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PermissionsGuard, RequirePermissions } from '../../auth';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { ISchedulerPort } from '../scheduler-port.interface';
import { SCHEDULER_PORT } from '../scheduler.constants';
import { ScheduledJobInfo } from '../scheduler.types';

export class RescheduleJobDto {
  cronExpression!: string;
}

@ApiTags('Admin Scheduler (Dynamic Cron Jobs & Background Tasks)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@RequirePermissions('users:manage')
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Hanya administrator yang diizinkan mengelola scheduler',
})
@Controller({ path: 'admin/scheduler', version: '1' })
export class AdminSchedulerController {
  constructor(
    @Inject(SCHEDULER_PORT)
    private readonly scheduler: ISchedulerPort,
  ) {}

  @Get('jobs')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('users:manage')
  @ApiOperation({
    summary: 'Melihat seluruh daftar dynamic cron jobs yang terdaftar',
    description:
      'Mengembalikan status aktif, ekspresi cron, zona waktu, dan jadwal eksekusi berikutnya dari seluruh job dinamis.',
  })
  @ApiOkResponse({ description: 'Daftar dynamic cron jobs berhasil diambil' })
  listJobs(): ScheduledJobInfo[] {
    return this.scheduler.listJobs();
  }

  @Post('jobs/:jobId/trigger')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('users:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Memicu eksekusi langsung dynamic cron job secara manual',
    description:
      'Menjalankan handler job secara instan tanpa menunggu jadwal cron berkala.',
  })
  @ApiParam({ name: 'jobId', description: 'ID unik dari scheduled job' })
  @ApiOkResponse({ description: 'Job berhasil dipicu dan dieksekusi' })
  async triggerJob(
    @Param('jobId') jobId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.scheduler.triggerJob(jobId);
    return {
      success: true,
      message: `Job "${jobId}" berhasil dipicu dan dieksekusi secara manual.`,
    };
  }

  @Post('jobs/:jobId/reschedule')
  @UseGuards(HybridAuthGuard, PermissionsGuard)
  @RequirePermissions('users:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mengubah jadwal ekspresi cron dari dynamic job',
    description: 'Memperbarui frekuensi cron tanpa me-restart server aplikasi.',
  })
  @ApiParam({ name: 'jobId', description: 'ID unik dari scheduled job' })
  @ApiOkResponse({ description: 'Job berhasil dijadwalkan ulang' })
  async rescheduleJob(
    @Param('jobId') jobId: string,
    @Body() dto: RescheduleJobDto,
  ): Promise<{ success: boolean; message: string }> {
    const updated = await this.scheduler.rescheduleJob(
      jobId,
      dto.cronExpression,
    );
    return {
      success: updated,
      message: updated
        ? `Job "${jobId}" berhasil dijadwalkan ulang dengan ekspresi: ${dto.cronExpression}`
        : `Job "${jobId}" gagal dijadwalkan ulang atau tidak ditemukan.`,
    };
  }
}

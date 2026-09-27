import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
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
import { eq } from 'drizzle-orm';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { patientProfiles } from '../../../database/schema';
import { PatientAppointmentHistoryService } from '../application/patient-appointment-history.service';
import { PatientAppointmentHistoryQueryDto } from './dto/patient-appointment-history-query.dto';

@ApiTags('Appointments (Riwayat Janji Temu Pasien)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@Controller({ path: 'appointments/history', version: '1' })
export class PatientAppointmentHistoryController {
  constructor(
    private readonly historyService: PatientAppointmentHistoryService,
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Melihat riwayat janji temu pasien yang sedang login (Mobile App)',
    description:
      'Mengambil daftar riwayat janji temu terminal (completed, cancelled, no_show) milik pasien yang sedang aktif.',
  })
  @ApiOkResponse({
    description: 'Riwayat janji temu pasien berhasil diambil',
  })
  async getMyHistory(
    @Query() query: PatientAppointmentHistoryQueryDto,
    @CurrentUser() user: any,
  ) {
    const patient = await this.db.query.patientProfiles.findFirst({
      where: eq(patientProfiles.userId, user.id),
    });

    if (!patient) {
      return {
        data: [],
        total: 0,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: 0,
      };
    }

    return this.historyService.getHistory(patient.id, query);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(HybridAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAF')
  @Get('patient/:patientId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Melihat riwayat janji temu pasien berdasarkan ID Pasien (Web / Staf)',
    description:
      'Mengambil daftar riwayat janji temu terminal (completed, cancelled, no_show) pasien tertentu untuk rekam jejak medis dan kehadiran.',
  })
  @ApiParam({
    name: 'patientId',
    description: 'ID profil pasien (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Riwayat janji temu pasien berhasil diambil',
  })
  @ApiForbiddenResponse({
    description: 'Hanya Dokter atau Staf yang diizinkan mengakses riwayat pasien lain',
  })
  async getPatientHistory(
    @Param('patientId', new ParseUUIDPipe()) patientId: string,
    @Query() query: PatientAppointmentHistoryQueryDto,
  ) {
    return this.historyService.getHistory(patientId, query);
  }
}

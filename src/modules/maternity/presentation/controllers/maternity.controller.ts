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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthenticatedUser,
  CurrentUser,
  HybridAuthGuard,
  isPatientUser,
  PermissionsGuard,
  RequirePermissions,
} from '../../../../common/auth';
import {
  PATIENT_AFFILIATION_REPOSITORY,
  type PatientAffiliationRepository,
} from '../../../patients/domain/repositories/patient-affiliation.repository';
import { CreateMaternityIntakeUseCase } from '../../application/use-cases/create-maternity-intake.use-case';
import { GetMaternityHistoryUseCase } from '../../application/use-cases/get-maternity-history.use-case';
import { GetMaternityIntakeUseCase } from '../../application/use-cases/get-maternity-intake.use-case';
import { UpdateMaternityIntakeUseCase } from '../../application/use-cases/update-maternity-intake.use-case';
import {
  MATERNITY_REPOSITORY,
  MaternityRepository,
} from '../../domain/repositories/maternity.repository.interface';
import { CreateMaternityIntakeDto } from '../dto/create-maternity-intake.dto';
import { MaternityHistoryQueryDto } from '../dto/maternity-query.dto';
import { UpdateMaternityIntakeDto } from '../dto/update-maternity-intake.dto';

@ApiTags('Maternity (Praktik Mandiri Bidan & Kesehatan Ibu Hamil)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, PermissionsGuard)
@Controller({ path: 'maternity', version: '1' })
export class MaternityController {
  constructor(
    private readonly createIntakeUseCase: CreateMaternityIntakeUseCase,
    private readonly updateIntakeUseCase: UpdateMaternityIntakeUseCase,
    private readonly getIntakeUseCase: GetMaternityIntakeUseCase,
    private readonly getHistoryUseCase: GetMaternityHistoryUseCase,
    @Inject(MATERNITY_REPOSITORY)
    private readonly maternityRepo: MaternityRepository,
    @Inject(PATIENT_AFFILIATION_REPOSITORY)
    private readonly affiliationRepo: PatientAffiliationRepository,
  ) {}

  @Post('intakes')
  @RequirePermissions('records:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit formulir intake kehamilan baru (Pasien / Dokter / Bidan)',
  })
  @ApiCreatedResponse({ description: 'Intake kehamilan berhasil disimpan' })
  async createIntake(
    @Body() body: CreateMaternityIntakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (isPatientUser(user)) {
      if (!user.patient?.id) {
        throw new ForbiddenException('Profil pasien Anda belum terdaftar');
      }
      if (body.patientId !== user.patient.id) {
        const isAffiliated = await this.affiliationRepo.findByUserAndPatient(
          user.id,
          body.patientId,
        );
        if (!isAffiliated) {
          throw new ForbiddenException(
            'Tidak memiliki wewenang untuk mengisi form pasien lain',
          );
        }
      }
    }
    return this.createIntakeUseCase.execute(body, user?.id);
  }

  @Get('intakes/:id')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary: 'Mendapatkan detail formulir intake maternal kehamilan by ID',
  })
  @ApiParam({ name: 'id', description: 'ID maternal intake atau submission' })
  async getIntakeById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const intake = await this.getIntakeUseCase.executeById(id);
    if (isPatientUser(user)) {
      if (intake.patientId !== user.patient?.id) {
        const isAffiliated = await this.affiliationRepo.findByUserAndPatient(
          user.id,
          intake.patientId,
        );
        if (!isAffiliated) {
          throw new ForbiddenException(
            'Tidak memiliki wewenang melihat rekam medis ini',
          );
        }
      }
    }
    return intake;
  }

  @Patch('intakes/:id')
  @RequirePermissions('records:write')
  @ApiOperation({
    summary:
      'Update formulir intake maternal kehamilan by ID (Admin / Bidan / Dokter)',
  })
  async updateIntakeById(
    @Param('id') id: string,
    @Body() body: UpdateMaternityIntakeDto,
  ) {
    return this.updateIntakeUseCase.execute(id, body);
  }

  @Get('appointment/:appointmentId')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary: 'Mendapatkan intake maternal berdasarkan ID Appointment / Janji Temu',
  })
  async getByAppointmentId(@Param('appointmentId') appointmentId: string) {
    return this.getIntakeUseCase.executeByAppointmentId(appointmentId);
  }

  @Get('history')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary: 'Mendapatkan riwayat pendaftaran pemeriksaan kehamilan (Paginasi)',
  })
  async getHistory(
    @Query() query: MaternityHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    let patientIds: string[] = [];

    if (isPatientUser(user)) {
      if (!user.patient?.id) {
        throw new ForbiddenException('Profil pasien Anda belum terdaftar');
      }
      const myId = user.patient.id;
      const userAffiliations = await this.affiliationRepo.findByUserId(
        user.id,
      );
      const affiliatedIds = userAffiliations.map((a: any) => a.patientId);
      const allowed = Array.from(new Set([myId, ...affiliatedIds]));

      if (query.patientId && !allowed.includes(query.patientId)) {
        throw new ForbiddenException(
          'Tidak memiliki wewenang mengakses riwayat kehamilan pasien ini',
        );
      }
      patientIds = query.patientId ? [query.patientId] : allowed;
    } else if (query.patientId) {
      patientIds = [query.patientId];
    }

    return this.getHistoryUseCase.execute(patientIds, query);
  }

  @Get('patient/:patientId/pregnancies')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary:
      'Mendapatkan seluruh riwayat kehamilan seorang pasien (Multi-Pregnancy / 1:N)',
  })
  @ApiParam({ name: 'patientId', description: 'ID profil pasien ibu' })
  async getPatientPregnancies(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (isPatientUser(user)) {
      if (patientId !== user.patient?.id) {
        const isAffiliated = await this.affiliationRepo.findByUserAndPatient(
          user.id,
          patientId,
        );
        if (!isAffiliated) {
          throw new ForbiddenException(
            'Tidak memiliki wewenang melihat riwayat pasien ini',
          );
        }
      }
    }
    return this.getHistoryUseCase.executeByPatientId(patientId);
  }
}

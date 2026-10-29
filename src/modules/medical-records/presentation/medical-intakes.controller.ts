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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { SYSTEM_ROLES } from '../../../auth/constants/auth.constants';
import {
  type AuthenticatedUser,
  CurrentUser,
  HybridAuthGuard,
  Roles,
  RolesGuard,
} from '../../../common/auth';
import {
  PATIENT_AFFILIATION_REPOSITORY,
  type PatientAffiliationRepository,
} from '../../patients/domain/repositories/patient-affiliation.repository';
import {
  PATIENT_REPOSITORY,
  type PatientRepository,
} from '../../patients/domain/repositories/patient.repository';
import { FormRequirementService } from '../application/form-requirement.service';
import {
  MEDICAL_RECORD_REPOSITORY,
  MedicalRecordRepository,
} from '../domain/repositories/medical-record.repository';
import { CreateChildImmunizationIntakeDto } from './dto/create-child-immunization-intake.dto';
import { CreateMaternityIntakeDto } from './dto/create-maternity-intake.dto';
import { CreateMedicalIntakeDto } from './dto/create-medical-intake.dto';
import { GetImmunizationHistoryQueryDto } from './dto/get-immunization-history-query.dto';
import { GetMaternalHistoryQueryDto } from './dto/get-maternal-history-query.dto';
import { UpdateChildImmunizationIntakeDto } from './dto/update-child-immunization-intake.dto';
import { UpdateMaternityIntakeDto } from './dto/update-maternity-intake.dto';
import { UpdateMedicalIntakeDto } from './dto/update-medical-intake.dto';

@ApiTags('Medical Intakes (Formulir Skrining, Imunisasi & Kehamilan)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Peran akun tidak memiliki wewenang untuk aksi ini',
})
@Controller({ path: 'medical-records/intakes', version: '1' })
export class MedicalIntakesController {
  constructor(
    @Inject(MEDICAL_RECORD_REPOSITORY)
    private readonly medicalRecordRepo: MedicalRecordRepository,
    private readonly formRequirementService: FormRequirementService,
    @Inject(PATIENT_AFFILIATION_REPOSITORY)
    private readonly affiliationRepo: PatientAffiliationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: PatientRepository,
  ) {}

  private async assertPatientAccess(
    patientId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (user.systemRole !== SYSTEM_ROLES.PATIENT) {
      return;
    }
    if (user.patient?.id === patientId) {
      return;
    }
    const isAffiliated = await this.affiliationRepo.findByUserAndPatient(
      user.id,
      patientId,
    );
    const ownPatient = await this.patientRepo.findByUserId(user.id);
    const isOwn = ownPatient && ownPatient.id === patientId;
    if (!isAffiliated && !isOwn) {
      throw new ForbiddenException(
        'Akses ditolak: Anda tidak memiliki wewenang untuk mengakses data rekam medis pasien lain.',
      );
    }
  }

  @Get('form-requirement')
  @Roles(SYSTEM_ROLES.PATIENT, SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Mendapatkan requirement formulir encounter, reusable data & omitted fields',
  })
  @ApiQuery({
    name: 'serviceId',
    required: true,
    description: 'ID layanan klinik',
  })
  @ApiQuery({
    name: 'patientId',
    required: false,
    description: 'ID pasien jika sudah terdaftar',
  })
  @ApiOkResponse({
    description: 'Requirement formulir encounter berhasil dihitung',
  })
  async getFormRequirement(
    @Query('serviceId') serviceId: string,
    @Query('patientId') patientId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const requirement = await this.formRequirementService.resolveRequirement(
      serviceId,
      patientId,
      user,
    );
    return {
      success: true,
      data: requirement,
    };
  }

  @Post()
  @Roles(SYSTEM_ROLES.PATIENT, SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit formulir skrining / intake medis pre-konsultasi',
  })
  @ApiCreatedResponse({ description: 'Intake medis berhasil disimpan' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form skrining gagal',
  })
  async createIntake(
    @Body() body: CreateMedicalIntakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.medicalRecordRepo.createIntake(
      {
        ...body,
        schemaVersion: body.schemaVersion || 'v1',
        automatic: body.automatic || {},
      },
      user?.id,
    );
  }

  @Post('maternity')
  @Roles(SYSTEM_ROLES.PATIENT, SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit formulir intake kehamilan & persalinan relasional',
  })
  @ApiCreatedResponse({ description: 'Intake kehamilan berhasil disimpan' })
  async createMaternityIntake(
    @Body() body: CreateMaternityIntakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.medicalRecordRepo.createMaternalIntake(body, user?.id);
  }

  @Post('immunization')
  @Roles(SYSTEM_ROLES.PATIENT, SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit formulir pendaftaran imunisasi anak relasional',
  })
  @ApiCreatedResponse({
    description: 'Intake imunisasi anak berhasil disimpan',
  })
  async createImmunizationIntake(
    @Body() body: CreateChildImmunizationIntakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.medicalRecordRepo.createImmunizationIntake(body, user?.id);
  }

  @Get('by-appointment/:appointmentId')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan data intake lengkap berdasarkan ID Kunjungan',
  })
  @ApiParam({ name: 'appointmentId', description: 'ID unik appointment' })
  @ApiOkResponse({ description: 'Data intake berhasil ditemukan' })
  async getUnifiedIntakeByAppointmentId(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const intake =
      await this.medicalRecordRepo.findUnifiedIntakeByAppointmentId(
        appointmentId,
      );
    if (!intake) {
      throw new NotFoundException(
        'Data intake untuk kunjungan ini tidak ditemukan',
      );
    }
    if (intake.patientId) {
      await this.assertPatientAccess(intake.patientId, user);
    }
    return intake;
  }

  @Get('patient/:patientId/latest')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan data intake terbaru berdasarkan ID Pasien',
  })
  @ApiParam({ name: 'patientId', description: 'ID unik pasien' })
  @ApiOkResponse({ description: 'Data intake pasien berhasil ditemukan' })
  async getLatestIntakeByPatientId(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('flow') flow?: string,
  ) {
    await this.assertPatientAccess(patientId, user);
    const intake = await this.medicalRecordRepo.findLatestIntakeByPatientId(
      patientId,
      flow,
    );
    if (!intake) {
      throw new NotFoundException('Data formulir intake pasien belum tersedia');
    }
    return intake;
  }

  @Get('maternity/history')
  @Roles(SYSTEM_ROLES.PATIENT, SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Mendapatkan riwayat formulir kehamilan & persalinan dengan paginasi',
  })
  async getMaternalHistory(
    @Query() query: GetMaternalHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    let targetPatientIds: string[] | undefined = undefined;

    if (user.systemRole === SYSTEM_ROLES.PATIENT) {
      const userAffiliations = await this.affiliationRepo.findByUserId(user.id);
      const allowedIds = userAffiliations.map((a) => a.patientId);

      const ownPatient = await this.patientRepo.findByUserId(user.id);
      if (ownPatient && !allowedIds.includes(ownPatient.id)) {
        allowedIds.push(ownPatient.id);
      }

      if (query.patientId) {
        if (!allowedIds.includes(query.patientId)) {
          throw new ForbiddenException(
            'Anda tidak memiliki wewenang untuk mengakses riwayat pasien ini.',
          );
        }
        targetPatientIds = [query.patientId];
      } else {
        if (allowedIds.length === 0) {
          return {
            data: [],
            total: 0,
            page: query.page || 1,
            limit: query.limit || 10,
            totalPages: 0,
          };
        }
        targetPatientIds = allowedIds;
      }
    } else if (query.patientId) {
      targetPatientIds = [query.patientId];
    }

    return this.medicalRecordRepo.findMaternalHistory(
      targetPatientIds || [],
      query,
    );
  }

  @Get('immunization/history')
  @Roles(SYSTEM_ROLES.PATIENT, SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary: 'Mendapatkan riwayat formulir imunisasi anak dengan paginasi',
  })
  async getImmunizationHistory(
    @Query() query: GetImmunizationHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    let targetPatientIds: string[] | undefined = undefined;

    if (user.systemRole === SYSTEM_ROLES.PATIENT) {
      const userAffiliations = await this.affiliationRepo.findByUserId(user.id);
      const allowedIds = userAffiliations.map((a) => a.patientId);

      const ownPatient = await this.patientRepo.findByUserId(user.id);
      if (ownPatient && !allowedIds.includes(ownPatient.id)) {
        allowedIds.push(ownPatient.id);
      }

      if (query.patientId) {
        if (!allowedIds.includes(query.patientId)) {
          throw new ForbiddenException(
            'Anda tidak memiliki wewenang untuk mengakses riwayat pasien ini.',
          );
        }
        targetPatientIds = [query.patientId];
      } else {
        if (allowedIds.length === 0) {
          return {
            data: [],
            total: 0,
            page: query.page || 1,
            limit: query.limit || 10,
            totalPages: 0,
          };
        }
        targetPatientIds = allowedIds;
      }
    } else if (query.patientId) {
      targetPatientIds = [query.patientId];
    }

    return this.medicalRecordRepo.findImmunizationHistory(
      targetPatientIds || [],
      query,
    );
  }

  @Get('maternity/:id')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan detail formulir intake maternal kehamilan by ID',
  })
  async getMaternalIntakeById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const intake = await this.medicalRecordRepo.findMaternalIntakeById(id);
    if (!intake) {
      throw new NotFoundException('Data intake maternal tidak ditemukan');
    }

    if (intake.patientId) {
      await this.assertPatientAccess(intake.patientId, user);
    }

    return intake;
  }

  @Patch('maternity/:id')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Update formulir intake maternal kehamilan by ID (Admin / Staf Dokter/Bidan)',
  })
  async updateMaternalIntakeById(
    @Param('id') id: string,
    @Body() body: UpdateMaternityIntakeDto,
  ) {
    const updated = await this.medicalRecordRepo.updateMaternalIntake(id, body);
    if (!updated) {
      throw new NotFoundException(
        'Data intake maternal tidak ditemukan untuk diperbarui',
      );
    }
    return updated;
  }

  @Get('immunization/:id')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan detail formulir intake imunisasi anak by ID',
  })
  async getImmunizationIntakeById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const intake = await this.medicalRecordRepo.findImmunizationIntakeById(id);
    if (!intake) {
      throw new NotFoundException('Data intake imunisasi tidak ditemukan');
    }

    if (intake.patientId) {
      await this.assertPatientAccess(intake.patientId, user);
    }

    return intake;
  }

  @Patch('immunization/:id')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Update formulir intake imunisasi anak by ID (Admin / Staf Dokter/Bidan)',
  })
  async updateImmunizationIntakeById(
    @Param('id') id: string,
    @Body() body: UpdateChildImmunizationIntakeDto,
  ) {
    const updated = await this.medicalRecordRepo.updateImmunizationIntake(
      id,
      body,
    );
    if (!updated) {
      throw new NotFoundException(
        'Data intake imunisasi tidak ditemukan untuk diperbarui',
      );
    }
    return updated;
  }

  @Get('patient/:patientId')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan riwayat skrining intake medis pasien',
  })
  @ApiParam({
    name: 'patientId',
    description: 'ID unik pasien',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  @ApiOkResponse({ description: 'Daftar intake pasien berhasil diambil' })
  async getIntakesByPatientId(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertPatientAccess(patientId, user);
    return this.medicalRecordRepo.findIntakesByPatientId(patientId);
  }

  @Get(':id')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.PATIENT)
  @ApiOperation({
    summary: 'Mendapatkan detail formulir intake medis by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik formulir intake medis',
    example: 'e0ab9132-e6d5-4b17-ac29-3fd7c0610bb1',
  })
  @ApiOkResponse({ description: 'Data intake medis berhasil ditemukan' })
  @ApiNotFoundResponse({ description: 'Data intake medis tidak ditemukan' })
  async getIntakeById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const intake = await this.medicalRecordRepo.findIntakeById(id);
    if (!intake) {
      throw new NotFoundException('Data intake medis tidak ditemukan');
    }
    if (intake.patientId) {
      await this.assertPatientAccess(intake.patientId, user);
    }
    return intake;
  }

  @Patch(':id')
  @Roles(SYSTEM_ROLES.STAF, SYSTEM_ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Update formulir intake medis (jawaban kuesioner) by ID (Admin / Staf Dokter/Bidan)',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik formulir intake submission',
  })
  async updateIntakeById(
    @Param('id') id: string,
    @Body() body: UpdateMedicalIntakeDto,
  ) {
    const updated = await this.medicalRecordRepo.updateIntakeSubmission(
      id,
      body.answers,
    );
    if (!updated) {
      throw new NotFoundException(
        'Data intake medis tidak ditemukan untuk diperbarui',
      );
    }
    return updated;
  }
}

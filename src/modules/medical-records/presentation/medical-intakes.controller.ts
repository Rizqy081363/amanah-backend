import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
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
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { Public } from '../../../common/auth/public.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { FormRequirementService } from '../application/form-requirement.service';
import {
  MEDICAL_RECORD_REPOSITORY,
  MedicalRecordRepository,
} from '../domain/repositories/medical-record.repository';
import { CreateChildImmunizationIntakeDto } from './dto/create-child-immunization-intake.dto';
import { CreateMaternityIntakeDto } from './dto/create-maternity-intake.dto';
import { CreateMedicalIntakeDto } from './dto/create-medical-intake.dto';

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
  ) {}

  @Get('form-requirement')
  @Roles('PATIENT', 'STAF', 'ADMIN')
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
    @CurrentUser() user?: any,
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
  @Roles('PATIENT', 'STAF', 'ADMIN')
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
    @CurrentUser() user: any,
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
  @Roles('PATIENT', 'STAF', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit formulir intake kehamilan & persalinan relasional',
  })
  @ApiCreatedResponse({ description: 'Intake kehamilan berhasil disimpan' })
  async createMaternityIntake(
    @Body() body: CreateMaternityIntakeDto,
    @CurrentUser() user: any,
  ) {
    return this.medicalRecordRepo.createMaternalIntake(body, user?.id);
  }

  @Post('immunization')
  @Roles('PATIENT', 'STAF', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit formulir pendaftaran imunisasi anak relasional',
  })
  @ApiCreatedResponse({
    description: 'Intake imunisasi anak berhasil disimpan',
  })
  async createImmunizationIntake(
    @Body() body: CreateChildImmunizationIntakeDto,
    @CurrentUser() user: any,
  ) {
    return this.medicalRecordRepo.createImmunizationIntake(body, user?.id);
  }

  @Get('by-appointment/:appointmentId')
  @Public()
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan data intake lengkap berdasarkan ID Kunjungan',
  })
  @ApiParam({ name: 'appointmentId', description: 'ID unik appointment' })
  @ApiOkResponse({ description: 'Data intake berhasil ditemukan' })
  async getUnifiedIntakeByAppointmentId(
    @Param('appointmentId') appointmentId: string,
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
    return intake;
  }

  @Get('patient/:patientId/latest')
  @Public()
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan data intake terbaru berdasarkan ID Pasien',
  })
  @ApiParam({ name: 'patientId', description: 'ID unik pasien' })
  @ApiOkResponse({ description: 'Data intake pasien berhasil ditemukan' })
  async getLatestIntakeByPatientId(
    @Param('patientId') patientId: string,
    @Query('flow') flow?: string,
  ) {
    const intake = await this.medicalRecordRepo.findLatestIntakeByPatientId(
      patientId,
      flow,
    );
    if (!intake) {
      throw new NotFoundException('Data formulir intake pasien belum tersedia');
    }
    return intake;
  }

  @Get('maternity/:id')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan detail formulir intake maternal kehamilan by ID',
  })
  async getMaternalIntakeById(@Param('id') id: string) {
    const intake = await this.medicalRecordRepo.findMaternalIntakeById(id);
    if (!intake) {
      throw new NotFoundException('Data intake maternal tidak ditemukan');
    }
    return intake;
  }

  @Get('immunization/:id')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan detail formulir intake imunisasi anak by ID',
  })
  async getImmunizationIntakeById(@Param('id') id: string) {
    const intake = await this.medicalRecordRepo.findImmunizationIntakeById(id);
    if (!intake) {
      throw new NotFoundException('Data intake imunisasi tidak ditemukan');
    }
    return intake;
  }

  @Get('patient/:patientId')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan riwayat skrining intake medis pasien',
  })
  @ApiParam({
    name: 'patientId',
    description: 'ID unik pasien',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  @ApiOkResponse({ description: 'Daftar intake pasien berhasil diambil' })
  async getIntakesByPatientId(@Param('patientId') patientId: string) {
    return this.medicalRecordRepo.findIntakesByPatientId(patientId);
  }

  @Get(':id')
  @Roles('STAF', 'ADMIN', 'PATIENT')
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
  async getIntakeById(@Param('id') id: string) {
    const intake = await this.medicalRecordRepo.findIntakeById(id);
    if (!intake) {
      throw new NotFoundException('Data intake medis tidak ditemukan');
    }
    return intake;
  }
}

import {
  Body,
  Controller,
  Delete,
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
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import {
  MEDICAL_RECORD_REPOSITORY,
  MedicalRecordRepository,
} from '../domain/repositories/medical-record.repository';
import { CreateMedicalIntakeDto } from './dto/create-medical-intake.dto';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { QueryMedicalRecordDto } from './dto/query-medical-record.dto';
import { UpdateDiagnosisDto } from './dto/update-diagnosis.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';

@ApiTags('Medical Records (Rekam Medis, Diagnosa ICD-10 & Resep Obat)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'medical-records', version: '1' })
export class MedicalRecordsController {
  constructor(
    @Inject(MEDICAL_RECORD_REPOSITORY)
    private readonly medicalRecordRepo: MedicalRecordRepository,
  ) {}

  @Post()
  @Roles('STAF', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mencatat Rekam Medis Klinis (SOAP, Diagnosa ICD-10 & Resep Obat)',
  })
  @ApiResponse({ status: 201, description: 'Rekam medis berhasil dicatat' })
  async createRecord(
    @Body() body: CreateMedicalRecordDto,
    @CurrentUser() user: any,
  ) {
    const practitionerId =
      body.staffId ||
      user?.staff?.practitionerId ||
      user?.staff?.id ||
      undefined;

    return this.medicalRecordRepo.create(
      {
        kunjunganId: body.kunjunganId,
        patientId: body.patientId,
        staffId: practitionerId,
        serviceId: body.serviceId,
        sourceIntakeId: body.sourceIntakeId,
        encounterDate:
          body.encounterDate || new Date().toISOString().split('T')[0],
        status: body.status || 'completed',
        subjective: body.subjective,
        objectiveNotes: body.objectiveNotes,
        vitalSigns: body.vitalSigns,
        diagnosis: body.diagnosis,
        diagnosisIcd10Code: body.diagnosisIcd10Code,
        diagnosisIcd10Name: body.diagnosisIcd10Name,
        tindakan: body.tindakan,
        resepObat: body.resepObat,
        prescriptions: body.prescriptions,
        catatanMedis: body.catatanMedis,
        flowType: body.flowType || 'general',
        motherNik: body.motherNik,
        partnerNik: body.partnerNik,
        childNik: body.childNik,
        formData: body.formData || {},
        computedData: body.computedData || {},
      },
      user?.id,
    );
  }

  @Get()
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Daftar semua rekam medis dengan paginasi, filter & pencarian',
  })
  async findAll(@Query() query: QueryMedicalRecordDto) {
    return this.medicalRecordRepo.findAll(query);
  }

  // Static sub-routes first to avoid route collisions
  @Get('me')
  @Roles('PATIENT', 'STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Mendapatkan riwayat rekam medis pasien yang sedang login',
  })
  async getMyRecords(@CurrentUser() user: any) {
    const patientId = user?.patient?.id;
    if (!patientId) {
      return [];
    }
    return this.medicalRecordRepo.findByPatientId(patientId);
  }

  @Post('intakes')
  @Roles('PATIENT', 'STAF', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit formulir skrining / intake medis pre-konsultasi',
  })
  @ApiResponse({ status: 201, description: 'Intake medis berhasil disimpan' })
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

  @Get('intakes/patient/:patientId')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({ summary: 'Mendapatkan riwayat skrining intake medis pasien' })
  async getIntakesByPatientId(@Param('patientId') patientId: string) {
    return this.medicalRecordRepo.findIntakesByPatientId(patientId);
  }

  @Get('intakes/:id')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({ summary: 'Mendapatkan detail formulir intake medis by ID' })
  async getIntakeById(@Param('id') id: string) {
    const intake = await this.medicalRecordRepo.findIntakeById(id);
    if (!intake) {
      throw new NotFoundException('Data intake medis tidak ditemukan');
    }
    return intake;
  }

  @Get('kunjungan/:kunjunganId')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan rekam medis berdasarkan ID Kunjungan / Appointment',
  })
  async getByKunjunganId(@Param('kunjunganId') kunjunganId: string) {
    const record = await this.medicalRecordRepo.findByKunjunganId(kunjunganId);
    if (!record) {
      throw new NotFoundException(
        `Rekam medis untuk kunjungan ${kunjunganId} tidak ditemukan`,
      );
    }
    return record;
  }

  @Get('patient/:patientId')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan seluruh riwayat rekam medis pasien kronologis',
  })
  async getByPatientId(@Param('patientId') patientId: string) {
    return this.medicalRecordRepo.findByPatientId(patientId);
  }

  @Get(':id')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan detail rekam medis klinis berdasarkan ID Encounter',
  })
  async getById(@Param('id') id: string) {
    const record = await this.medicalRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException(
        `Rekam medis dengan ID ${id} tidak ditemukan`,
      );
    }
    return record;
  }

  @Patch(':id')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Memperbarui data rekam medis klinis',
  })
  async updateRecord(
    @Param('id') id: string,
    @Body() body: UpdateMedicalRecordDto,
    @CurrentUser() user: any,
  ) {
    const practitionerId =
      body.staffId ||
      user?.staff?.practitionerId ||
      user?.staff?.id ||
      undefined;

    const updated = await this.medicalRecordRepo.update(id, {
      ...body,
      staffId: practitionerId,
    });

    if (!updated) {
      throw new NotFoundException(
        `Rekam medis dengan ID ${id} tidak ditemukan`,
      );
    }
    return updated;
  }

  @Patch(':id/diagnosis')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Dokter / Praktisi memperbarui diagnosa kerja & resep obat',
  })
  async updateDiagnosis(
    @Param('id') id: string,
    @Body() body: UpdateDiagnosisDto,
    @CurrentUser() user: any,
  ) {
    const practitionerId =
      user?.staff?.practitionerId || user?.staff?.id || undefined;

    const updated = await this.medicalRecordRepo.updateDiagnosis(id, {
      ...body,
      staffId: practitionerId,
    });

    if (!updated) {
      throw new NotFoundException(
        `Rekam medis dengan ID ${id} tidak ditemukan`,
      );
    }
    return updated;
  }

  @Delete(':id')
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Menghapus rekam medis klinis (Admin / Staf)' })
  async deleteRecord(@Param('id') id: string) {
    const deleted = await this.medicalRecordRepo.delete(id);
    if (!deleted) {
      throw new NotFoundException(
        `Rekam medis dengan ID ${id} tidak ditemukan`,
      );
    }
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { formatETag } from '../../../common/occ';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
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
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Peran akun tidak memiliki wewenang untuk aksi ini',
})
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
    description:
      'Dokter atau Bidan mencatat hasil anamnesis, pemeriksaan fisik, tanda vital, kode ICD-10, tindakan, dan peresepan obat.',
  })
  @ApiCreatedResponse({
    description: 'Rekam medis berhasil dicatat',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form data rekam medis gagal',
  })
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
    description:
      'Menampilkan rekam medis klinik dengan filter tanggal encounter, poliklinik, pasien, atau kata kunci diagnosa.',
  })
  @ApiOkResponse({ description: 'Daftar rekam medis berhasil diambil' })
  async findAll(@Query() query: QueryMedicalRecordDto) {
    return this.medicalRecordRepo.findAll(query);
  }

  // Static sub-routes first to avoid route collisions
  @Get('me')
  @Roles('PATIENT', 'STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Mendapatkan riwayat rekam medis pasien yang sedang login',
    description:
      'Pasien dapat melihat riwayat kunjungan dan resume medis pribadinya.',
  })
  @ApiOkResponse({
    description: 'Riwayat rekam medis pasien login berhasil diambil',
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
    description:
      'Pasien atau perawat mengisi data anamnesis mandiri (skrining kehamilan, riwayat alergi, keluhan awal) sebelum konsultasi.',
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

  @Get('intakes/patient/:patientId')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan riwayat skrining intake medis pasien',
    description:
      'Menampilkan seluruh intake formulir skrining yang pernah diisi untuk pasien tertentu.',
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

  @Get('intakes/:id')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan detail formulir intake medis by ID',
    description:
      'Mengambil jawaban form kuesioner skrining klinis berdasarkan ID formulir.',
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

  @Get('kunjungan/:kunjunganId')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan rekam medis berdasarkan ID Kunjungan / Appointment',
    description:
      'Menampilkan lembar rekam medis klinis yang terkait langsung dengan sesi appointment.',
  })
  @ApiParam({
    name: 'kunjunganId',
    description: 'ID unik kunjungan janji temu',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @ApiOkResponse({ description: 'Rekam medis kunjungan berhasil ditemukan' })
  @ApiNotFoundResponse({ description: 'Rekam medis tidak ditemukan' })
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
    description:
      'Mengambil rekam riwayat medis lengkap pasien diurutkan dari tanggal encounter terbaru.',
  })
  @ApiParam({
    name: 'patientId',
    description: 'ID unik pasien',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  @ApiOkResponse({ description: 'Riwayat rekam medis pasien berhasil diambil' })
  async getByPatientId(@Param('patientId') patientId: string) {
    return this.medicalRecordRepo.findByPatientId(patientId);
  }

  @Get(':id')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan detail rekam medis klinis berdasarkan ID Encounter',
    description:
      'Mengambil data lengkap SOAP, tanda vital, rincian obat, dan dokter pemeriksa.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik rekam medis encounter',
    example: 'dc193720-f81b-44b7-8e9d-85a35caed466',
  })
  @ApiOkResponse({ description: 'Detail rekam medis berhasil ditemukan' })
  @ApiNotFoundResponse({ description: 'Rekam medis tidak ditemukan' })
  async getById(
    @Param('id') id: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const record = await this.medicalRecordRepo.findById(id);
    if (!record) {
      throw new NotFoundException(
        `Rekam medis dengan ID ${id} tidak ditemukan`,
      );
    }
    if (res && record.version) {
      res.setHeader('ETag', formatETag(record.version));
    }
    return record;
  }

  @Patch(':id')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Memperbarui data rekam medis klinis',
    description: 'Mengubah catatan anamnesis SOAP atau catatan tindakan medis.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik rekam medis',
    example: 'dc193720-f81b-44b7-8e9d-85a35caed466',
  })
  @ApiOkResponse({ description: 'Rekam medis berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Rekam medis tidak ditemukan' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi data pembaruan gagal',
  })
  async updateRecord(
    @Param('id') id: string,
    @Body() body: UpdateMedicalRecordDto,
    @CurrentUser() user: any,
    @Headers('if-match') ifMatch?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const practitionerId =
      body.staffId ||
      user?.staff?.practitionerId ||
      user?.staff?.id ||
      undefined;

    const expectedVersion = ifMatch || (body as any)?.version;

    const updated = await this.medicalRecordRepo.update(
      id,
      {
        ...body,
        staffId: practitionerId,
      },
      expectedVersion,
    );

    if (!updated) {
      throw new NotFoundException(
        `Rekam medis dengan ID ${id} tidak ditemukan`,
      );
    }
    if (res && updated.version) {
      res.setHeader('ETag', formatETag(updated.version));
    }
    return updated;
  }

  @Patch(':id/diagnosis')
  @Roles('STAF', 'ADMIN')
  @ApiOperation({
    summary: 'Dokter / Praktisi memperbarui diagnosa kerja & resep obat',
    description:
      'Memperbarui kode ICD-10, nama diagnosa kerja, atau daftar resep obat apotek.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik rekam medis',
    example: 'dc193720-f81b-44b7-8e9d-85a35caed466',
  })
  @ApiOkResponse({ description: 'Diagnosa dan resep obat berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Rekam medis tidak ditemukan' })
  @ApiUnprocessableEntityResponse({
    description: 'Format diagnosa atau resep tidak valid',
  })
  async updateDiagnosis(
    @Param('id') id: string,
    @Body() body: UpdateDiagnosisDto,
    @CurrentUser() user: any,
    @Headers('if-match') ifMatch?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const practitionerId =
      user?.staff?.practitionerId || user?.staff?.id || undefined;

    const expectedVersion = ifMatch || (body as any)?.version;

    const updated = await this.medicalRecordRepo.updateDiagnosis(
      id,
      {
        ...body,
        staffId: practitionerId,
      },
      expectedVersion,
    );

    if (!updated) {
      throw new NotFoundException(
        `Rekam medis dengan ID ${id} tidak ditemukan`,
      );
    }
    if (res && updated.version) {
      res.setHeader('ETag', formatETag(updated.version));
    }
    return updated;
  }

  @Delete(':id')
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus rekam medis klinis (Admin / Staf)',
    description: 'Soft delete rekam medis bila terjadi kesalahan penginputan.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik rekam medis',
    example: 'dc193720-f81b-44b7-8e9d-85a35caed466',
  })
  @ApiNoContentResponse({ description: 'Rekam medis berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Rekam medis tidak ditemukan' })
  async deleteRecord(@Param('id') id: string) {
    const deleted = await this.medicalRecordRepo.delete(id);
    if (!deleted) {
      throw new NotFoundException(
        `Rekam medis dengan ID ${id} tidak ditemukan`,
      );
    }
  }
}

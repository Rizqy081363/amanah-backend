import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import {
  MEDICAL_RECORD_REPOSITORY,
  MedicalRecordRepository,
} from '../domain/repositories/medical-record.repository';
import { CurrentUser } from '../../../common/auth/current-user.decorator';

@ApiTags('Medical Records (Rekam Medis & KIA)')
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
  @ApiOperation({ summary: 'Menyimpan data rekam medis kunjungan / formulir KIA' })
  async createRecord(
    @Body()
    body: {
      kunjunganId: string;
      patientId: string;
      flowType: 'pregnancy' | 'immunization' | 'general';
      motherNik?: string;
      partnerNik?: string;
      childNik?: string;
      formData?: Record<string, any>;
      computedData?: Record<string, any>;
      diagnosis?: string;
      tindakan?: string;
      resepObat?: string;
      catatanMedis?: string;
    },
    @CurrentUser() user: any,
  ) {
    return this.medicalRecordRepo.create({
      ...body,
      formData: body.formData || {},
      computedData: body.computedData || {},
      staffId: user.staff?.id || undefined,
    });
  }

  @Get('kunjungan/:kunjunganId')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({ summary: 'Mendapatkan rekam medis berdasarkan ID Kunjungan' })
  async getByKunjunganId(@Param('kunjunganId') kunjunganId: string) {
    return this.medicalRecordRepo.findByKunjunganId(kunjunganId);
  }

  @Get('patient/:patientId')
  @Roles('STAF', 'ADMIN', 'PATIENT')
  @ApiOperation({ summary: 'Mendapatkan riwayat rekam medis pasien' })
  async getByPatientId(@Param('patientId') patientId: string) {
    return this.medicalRecordRepo.findByPatientId(patientId);
  }

  @Patch(':id/diagnosis')
  @Roles('STAF')
  @ApiOperation({ summary: 'Dokter / Bidan memperbarui diagnosa & resep obat' })
  async updateDiagnosis(
    @Param('id') id: string,
    @Body()
    body: {
      diagnosis?: string;
      tindakan?: string;
      resepObat?: string;
      catatanMedis?: string;
    },
    @CurrentUser() user: any,
  ) {
    return this.medicalRecordRepo.updateDiagnosis(id, {
      ...body,
      staffId: user.staff?.id || undefined,
    });
  }
}

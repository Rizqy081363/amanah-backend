import { Controller, Get, Param, UseGuards, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import {
  PATIENT_REPOSITORY,
  PatientRepository,
} from '../domain/repositories/patient.repository';
import { CurrentUser } from '../../../common/auth/current-user.decorator';

@ApiTags('Patients (Data Pasien & Rekam Medis)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'patients', version: '1' })
export class PatientsController {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: PatientRepository,
  ) {}

  @Get('me')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({ summary: 'Mendapatkan profil pasien login saat ini' })
  async getMyProfile(@CurrentUser() user: any) {
    if (user.patient) {
      return user.patient;
    }
    return this.patientRepo.findByUserId(user.id);
  }

  @Get('by-nik/:nik')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({ summary: 'Mencari pasien berdasarkan 16 digit NIK KTP' })
  async getPatientByNikAlias(@Param('nik') nik: string) {
    return this.patientRepo.findByNik(nik);
  }

  @Get('nik/:nik')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({ summary: 'Mencari pasien berdasarkan 16 digit NIK KTP' })
  async getPatientByNik(@Param('nik') nik: string) {
    return this.patientRepo.findByNik(nik);
  }

  @Get()
  @Roles('ADMIN', 'STAF')
  @ApiOperation({ summary: 'Mendapatkan daftar seluruh pasien klinik (Admin & Staf)' })
  async getPatients() {
    return this.patientRepo.findMany();
  }

  @Get(':id')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({ summary: 'Mendapatkan profil detail pasien berdasarkan ID' })
  async getPatientById(@Param('id') id: string) {
    return this.patientRepo.findById(id);
  }
}

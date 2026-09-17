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
  PATIENT_REPOSITORY,
  PatientRepository,
} from '../domain/repositories/patient.repository';
import { CreatePatientDto } from './dto/create-patient.dto';
import { QueryPatientDto } from './dto/query-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@ApiTags('Patients (Data Pasien & Rekam Medis)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'patients', version: '1' })
export class PatientsController {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: PatientRepository,
  ) {}

  @Post()
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mendaftarkan pasien baru oleh Admin/Staf (Meja Registrasi)',
  })
  @ApiResponse({ status: 201, description: 'Pasien berhasil didaftarkan' })
  async createPatient(@Body() body: CreatePatientDto) {
    return this.patientRepo.create({
      userId: body.userId || '',
      medicalRecordNumber: '',
      nik: body.nik,
      fullName: body.fullName,
      gender: body.gender,
      birthPlace: body.birthPlace || '',
      birthDate: body.birthDate,
      bloodType: body.bloodType || 'unknown',
      namaIbuKandung: body.namaIbuKandung,
      pekerjaan: body.pekerjaan,
      phoneNumber: body.phoneNumber,
      address: body.address,
      medicalHistory: body.medicalHistory,
      emergencyContactName: null,
      emergencyContactPhone: null,
      allergies: [],
      avatarUrl: null,
    });
  }

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
    const patient = await this.patientRepo.findByNik(nik);
    if (!patient) {
      throw new NotFoundException(`Pasien dengan NIK ${nik} tidak ditemukan`);
    }
    return patient;
  }

  @Get('nik/:nik')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Mencari pasien berdasarkan 16 digit NIK KTP (Kanonikal)',
  })
  async getPatientByNik(@Param('nik') nik: string) {
    const patient = await this.patientRepo.findByNik(nik);
    if (!patient) {
      throw new NotFoundException(`Pasien dengan NIK ${nik} tidak ditemukan`);
    }
    return patient;
  }

  @Get()
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary:
      'Mendapatkan daftar pasien klinik dengan paginasi dan pencarian (Admin & Staf)',
  })
  async getPatients(@Query() query: QueryPatientDto) {
    if (query.nik) {
      const patient = await this.patientRepo.findByNik(query.nik);
      return patient ? [patient] : [];
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    return this.patientRepo.findMany(limit, offset, query.search);
  }

  @Get(':id')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({ summary: 'Mendapatkan profil detail pasien berdasarkan ID' })
  async getPatientById(@Param('id') id: string) {
    const patient = await this.patientRepo.findById(id);
    if (!patient) {
      throw new NotFoundException(`Pasien dengan ID ${id} tidak ditemukan`);
    }
    return patient;
  }

  @Patch(':id')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({ summary: 'Memperbarui data profil pasien' })
  async updatePatient(@Param('id') id: string, @Body() body: UpdatePatientDto) {
    const updated = await this.patientRepo.update(id, body);
    if (!updated) {
      throw new NotFoundException(`Pasien dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Menonaktifkan data pasien (Admin)' })
  async deletePatient(@Param('id') id: string) {
    await this.patientRepo.delete(id);
  }
}

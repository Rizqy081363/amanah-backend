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
  PATIENT_REPOSITORY,
  PatientRepository,
} from '../domain/repositories/patient.repository';
import { CreatePatientDto } from './dto/create-patient.dto';
import { QueryPatientDto } from './dto/query-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@ApiTags('Patients (Data Pasien & Rekam Medis)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description:
    'Akses ditolak: Peran akun tidak memiliki wewenang untuk aksi ini',
})
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
    summary: 'Mendaftarkan pasien baru (Meja Registrasi)',
    description:
      'Admin atau staf loket mendaftarkan data demografi pasien baru dengan auto-generate Nomor Rekam Medis (MRN).',
  })
  @ApiCreatedResponse({
    description:
      'Pasien berhasil didaftarkan dan mendapatkan nomor rekam medis',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Validasi identitas pasien gagal (format NIK salah, tanggal lahir tidak valid)',
  })
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
  @ApiOperation({
    summary: 'Mendapatkan profil pasien login saat ini',
    description:
      'Mengambil data profil rekam medis pasien yang sedang masuk ke portal pasien.',
  })
  @ApiOkResponse({
    description: 'Profil pasien berhasil diambil',
  })
  async getMyProfile(@CurrentUser() user: any) {
    if (user.patient) {
      return user.patient;
    }
    return this.patientRepo.findByUserId(user.id);
  }

  @Get('by-nik/:nik')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Mencari pasien berdasarkan 16 digit NIK KTP',
    description:
      'Mencari rekam data pasien klinik menggunakan Nomor Induk Kependudukan.',
  })
  @ApiParam({
    name: 'nik',
    description: '16 digit NIK KTP Pasien',
    example: '3201234567890001',
  })
  @ApiOkResponse({ description: 'Data pasien berhasil ditemukan' })
  @ApiNotFoundResponse({
    description: 'Pasien dengan NIK tersebut tidak ditemukan',
  })
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
    description: 'Rute kanonikal pencarian profil pasien berdasarkan NIK.',
  })
  @ApiParam({
    name: 'nik',
    description: '16 digit NIK KTP Pasien',
    example: '3201234567890001',
  })
  @ApiOkResponse({ description: 'Data pasien berhasil ditemukan' })
  @ApiNotFoundResponse({
    description: 'Pasien dengan NIK tersebut tidak ditemukan',
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
    summary: 'Daftar pasien klinik dengan pagination dan pencarian',
    description:
      'Mengambil daftar pasien dengan filter pencarian nama, nomor RM, atau NIK.',
  })
  @ApiOkResponse({ description: 'Daftar pasien berhasil diambil' })
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
  @ApiOperation({
    summary: 'Mendapatkan profil detail pasien berdasarkan ID',
    description:
      'Mengambil informasi lengkap data demografi dan kontak darurat pasien.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik pasien',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  @ApiOkResponse({ description: 'Data pasien berhasil ditemukan' })
  @ApiNotFoundResponse({
    description: 'Pasien dengan ID tersebut tidak ditemukan',
  })
  async getPatientById(@Param('id') id: string) {
    const patient = await this.patientRepo.findById(id);
    if (!patient) {
      throw new NotFoundException(`Pasien dengan ID ${id} tidak ditemukan`);
    }
    return patient;
  }

  @Patch(':id')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Memperbarui data profil pasien',
    description:
      'Mengubah alamat domisili, nomor telepon, atau data demografi pasien.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik pasien',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  @ApiOkResponse({ description: 'Data pasien berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Pasien tidak ditemukan' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi data pembaruan gagal',
  })
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
  @ApiOperation({
    summary: 'Menonaktifkan data pasien (Admin)',
    description: 'Soft delete data pasien dari operasional klinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik pasien',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  @ApiNoContentResponse({ description: 'Data pasien berhasil dinonaktifkan' })
  @ApiNotFoundResponse({ description: 'Pasien tidak ditemukan' })
  async deletePatient(@Param('id') id: string) {
    await this.patientRepo.delete(id);
  }
}

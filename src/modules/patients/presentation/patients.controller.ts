import {
  Body,
  Controller,
  Delete,
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
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiConflictResponse,
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
import {
  CurrentUser,
  HybridAuthGuard,
  Roles,
  RolesGuard,
} from '../../../common/auth';
import {
  PATIENT_REPOSITORY,
  PatientRepository,
} from '../domain/repositories/patient.repository';
import {
  PATIENT_AFFILIATION_REPOSITORY,
  type PatientAffiliationRepository,
} from '../domain/repositories/patient-affiliation.repository';
import { CreatePatientDto } from './dto/create-patient.dto';
import { QueryPatientDto } from './dto/query-patient.dto';
import { RegisterPatientDto } from './dto/register-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@ApiTags('Patients (Data Pasien & Rekam Medis)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
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
    @Inject(PATIENT_AFFILIATION_REPOSITORY)
    private readonly affiliationRepo: PatientAffiliationRepository,
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

  @Post('registration')
  @Roles('PATIENT', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrasi mandiri profil pasien (Onboarding Modal Barrier)',
    description:
      'Pasien pertama kali login melengkapi 17 atribut data kependudukan dan domisili untuk pembentukan rekam medis resmi klinik.',
  })
  @ApiCreatedResponse({
    description:
      'Profil rekam medis pasien berhasil dibuat dan ditautkan ke akun pengguna',
  })
  @ApiConflictResponse({
    description:
      'NIK sudah terdaftar pada pasien lain, atau akun pengguna sudah memiliki profil pasien',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form data pasien gagal',
  })
  async registerPatient(
    @CurrentUser() user: any,
    @Body() body: RegisterPatientDto,
  ) {
    return this.patientRepo.register(user.id, body);
  }

  @Get('me')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Mendapatkan profil pasien login saat ini',
    description:
      'Mengambil seluruh data profil rekam medis pasien yang sedang masuk, termasuk 17 atribut demografi, alamat terstruktur, dan kontak darurat.',
  })
  @ApiOkResponse({
    description: 'Profil lengkap pasien berhasil diambil',
  })
  @ApiNotFoundResponse({
    description: 'Profil pasien belum terdaftar untuk akun ini',
  })
  async getMyProfile(@CurrentUser() user: any) {
    const patient = await this.patientRepo.findByUserId(user.id);
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Profil pasien belum terdaftar untuk akun ini.',
      });
    }
    return patient;
  }

  @Patch('me')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Memperbarui profil pasien login saat ini (Self-Update)',
    description:
      'Pasien memperbarui informasi demografi, alamat domisili terstruktur, kontak darurat, atau nomor telepon sendiri.',
  })
  @ApiOkResponse({
    description: 'Profil pasien berhasil diperbarui',
  })
  @ApiNotFoundResponse({
    description: 'Profil pasien tidak ditemukan untuk akun ini',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi form data pembaruan gagal',
  })
  async updateMyProfile(
    @CurrentUser() user: any,
    @Body() body: UpdatePatientDto,
  ) {
    const patient = await this.patientRepo.findByUserId(user.id);
    if (!patient) {
      throw new NotFoundException({
        code: 'PATIENT_NOT_FOUND',
        message: 'Profil pasien belum terdaftar untuk akun ini.',
      });
    }
    const updated = await this.patientRepo.update(patient.id, body as any);
    return updated;
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
      'Mengambil informasi lengkap data demografi dan kontak darurat pasien. Pasien hanya dapat melihat profil miliknya sendiri.',
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
  @ApiForbiddenResponse({
    description: 'Pasien tidak diizinkan mengakses data pasien lain',
  })
  async getPatientById(@Param('id') id: string, @CurrentUser() user: any) {
    const patient = await this.patientRepo.findById(id);
    if (!patient) {
      throw new NotFoundException(`Pasien dengan ID ${id} tidak ditemukan`);
    }

    if (user.systemRole === 'PATIENT' && patient.userId !== user.id) {
      const isAffiliated = await this.affiliationRepo.findByUserAndPatient(
        user.id,
        id,
      );
      if (!isAffiliated) {
        throw new ForbiddenException(
          'Anda tidak memiliki wewenang untuk mengakses data pasien lain.',
        );
      }
    }

    return patient;
  }

  @Patch(':id')
  @Roles('ADMIN', 'STAF', 'PATIENT')
  @ApiOperation({
    summary: 'Memperbarui data profil pasien',
    description:
      'Mengubah alamat domisili, nomor telepon, atau data demografi pasien. Pasien hanya dapat memperbarui profil miliknya sendiri.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik pasien',
    example: 'a8e79644-a541-4d05-b431-99c99d8620ec',
  })
  @ApiOkResponse({ description: 'Data pasien berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Pasien tidak ditemukan' })
  @ApiForbiddenResponse({
    description: 'Pasien tidak diizinkan memperbarui profil pasien lain',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi data pembaruan gagal',
  })
  async updatePatient(
    @Param('id') id: string,
    @Body() body: UpdatePatientDto,
    @CurrentUser() user: any,
  ) {
    const existing = await this.patientRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Pasien dengan ID ${id} tidak ditemukan`);
    }

    if (user.systemRole === 'PATIENT' && existing.userId !== user.id) {
      const isAffiliated = await this.affiliationRepo.findByUserAndPatient(
        user.id,
        id,
      );
      if (!isAffiliated) {
        throw new ForbiddenException(
          'Anda tidak memiliki wewenang untuk mengubah data pasien lain.',
        );
      }
    }

    const updated = await this.patientRepo.update(id, body as any);
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

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
  STAFF_REPOSITORY,
  StaffRepository,
} from '../domain/repositories/staff.repository';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@ApiTags('Staffs (Pegawai Klinis & Kartu ID Digital)')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiUnauthorizedResponse({
  description: 'Sesi autentikasi tidak valid atau token tidak disertakan',
})
@ApiForbiddenResponse({
  description: 'Akses ditolak: Hanya staf/admin berwenang yang dapat mengakses',
})
@Controller({ path: 'staffs', version: '1' })
export class StaffsController {
  constructor(
    @Inject(STAFF_REPOSITORY)
    private readonly staffRepo: StaffRepository,
  ) {}

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan profil staf klinis baru (Admin)',
    description:
      'Administrator mendaftarkan profil tenaga kesehatan (dokter, bidan, perawat, apoteker).',
  })
  @ApiCreatedResponse({
    description: 'Profil staf berhasil didaftarkan',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi identitas staf gagal',
  })
  async createStaff(@Body() body: CreateStaffDto) {
    return this.staffRepo.create({
      userId: body.userId || '',
      poliklinikId: body.poliklinikId || '',
      fullName: body.fullName,
      profession: body.profession,
      idCardNumber: body.idCardNumber || '',
      photoUrl: body.photoUrl || null,
      phoneNumber: body.phoneNumber,
      isActive: body.isActive ?? true,
    });
  }

  @Get('me')
  @Roles('STAF')
  @ApiOperation({
    summary: 'Mendapatkan profil dan Kartu ID digital staf login',
    description:
      'Mengambil informasi biodata, unit poliklinik, dan kode Kartu ID digital untuk presensi staf.',
  })
  @ApiOkResponse({
    description: 'Profil staf dan digital ID berhasil diambil',
  })
  async getMyProfile(@CurrentUser() user: any) {
    return this.staffRepo.findByUserId(user.id);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Mendapatkan daftar seluruh staf klinis (Admin)',
    description:
      'Mengambil seluruh profil staf operasional klinik aktif maupun non-aktif.',
  })
  @ApiOkResponse({
    description: 'Daftar seluruh staf berhasil diambil',
  })
  async getAllStaffs() {
    return this.staffRepo.findAll();
  }

  @Get('profession/:profession')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Filter staf berdasarkan profesi klinis',
    description:
      'Mengambil daftar staf berdasarkan kategori profesi: dokter, bidan, perawat, atau staf umum.',
  })
  @ApiParam({
    name: 'profession',
    description: 'Kategori profesi klinis',
    example: 'dokter',
  })
  @ApiOkResponse({
    description: 'Daftar staf dengan profesi tersebut berhasil diambil',
  })
  async getStaffsByProfession(@Param('profession') profession: string) {
    return this.staffRepo.findByProfession(profession);
  }

  @Get(':id')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Mendapatkan detail profil staf berdasarkan ID',
    description:
      'Mengambil profil spesifik staf medis termasuk penugasan poliklinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
    example: '96ab2405-5608-4ad5-ad76-7a4706bad8db',
  })
  @ApiOkResponse({ description: 'Profil staf berhasil ditemukan' })
  @ApiNotFoundResponse({
    description: 'Staf dengan ID tersebut tidak ditemukan',
  })
  async getStaffById(@Param('id') id: string) {
    const staff = await this.staffRepo.findById(id);
    if (!staff) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }
    return staff;
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Memperbarui data profil staf (Admin)',
    description:
      'Mengubah nama gelar, profesi, nomor kontak, atau status aktif staf.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
    example: '96ab2405-5608-4ad5-ad76-7a4706bad8db',
  })
  @ApiOkResponse({ description: 'Data staf berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Staf tidak ditemukan' })
  @ApiUnprocessableEntityResponse({ description: 'Validasi pembaruan gagal' })
  async updateStaff(@Param('id') id: string, @Body() body: UpdateStaffDto) {
    const updated = await this.staffRepo.update(id, body);
    if (!updated) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menonaktifkan staf (Admin)',
    description:
      'Soft delete penonaktifan staf dari sistem operasional klinik.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
    example: '96ab2405-5608-4ad5-ad76-7a4706bad8db',
  })
  @ApiNoContentResponse({ description: 'Staf berhasil dinonaktifkan' })
  @ApiNotFoundResponse({ description: 'Staf tidak ditemukan' })
  async deleteStaff(@Param('id') id: string) {
    await this.staffRepo.delete(id);
  }

  @Get(':id/credentials')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Melihat daftar legalitas/kredensial staf (SIP, STR)',
    description:
      'Mengambil riwayat Surat Izin Praktik (SIP) dan Surat Tanda Registrasi (STR) tenaga medis.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
    example: '96ab2405-5608-4ad5-ad76-7a4706bad8db',
  })
  @ApiOkResponse({ description: 'Daftar kredensial berhasil diambil' })
  async getCredentials(@Param('id') id: string) {
    return this.staffRepo.findCredentials(id);
  }

  @Post(':id/credentials')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan kredensial SIP/STR untuk staf',
    description:
      'Mencatat nomor izin praktik dan masa berlaku legalitas tenaga medis.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
    example: '96ab2405-5608-4ad5-ad76-7a4706bad8db',
  })
  @ApiCreatedResponse({ description: 'Kredensial berhasil dicatat' })
  @ApiUnprocessableEntityResponse({
    description: 'Validasi berkas SIP/STR gagal',
  })
  async addCredential(
    @Param('id') id: string,
    @Body() body: CreateCredentialDto,
  ) {
    return this.staffRepo.addCredential(id, body);
  }
}

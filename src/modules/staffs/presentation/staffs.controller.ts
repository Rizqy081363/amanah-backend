import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { AvatarService } from '../../avatar/avatar.service';
import {
  STAFF_REPOSITORY,
  StaffRepository,
} from '../domain/repositories/staff.repository';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@ApiTags('Staffs (Pegawai Klinis & Kartu ID Digital)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
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
    private readonly avatarService: AvatarService,
  ) {}

  @Get('me')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Mendapatkan profil dan Kartu ID digital staf login',
    description:
      'Mengambil informasi biodata, unit poliklinik, dan kode Kartu ID digital untuk presensi staf.',
  })
  @ApiOkResponse({
    description: 'Profil staf dan digital ID berhasil diambil',
  })
  async getMyProfile(@CurrentUser() user: any) {
    const staff = await this.staffRepo.findByUserId(user.id);
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Profil staf belum terdaftar atau terhubung dengan akun ini.',
      });
    }
    return staff;
  }

  @Patch('me')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Memperbarui profil staf login saat ini (Self-Update)',
    description:
      'Staf atau dokter memperbarui nama lengkap, nomor telepon, atau foto profil staf miliknya.',
  })
  @ApiOkResponse({ description: 'Profil staf berhasil diperbarui' })
  @ApiNotFoundResponse({
    description: 'Profil staf tidak ditemukan untuk akun ini',
  })
  @ApiUnprocessableEntityResponse({ description: 'Validasi pembaruan gagal' })
  async updateMyProfile(
    @CurrentUser() user: any,
    @Body() body: UpdateStaffDto,
  ) {
    const staff = await this.staffRepo.findByUserId(user.id);
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Profil staf belum terdaftar atau terhubung dengan akun ini.',
      });
    }
    const updatePayload: Partial<any> = {};
    if (body.fullName !== undefined) updatePayload.fullName = body.fullName;
    if (body.phoneNumber !== undefined)
      updatePayload.phoneNumber = body.phoneNumber;
    if (body.photoUrl !== undefined) updatePayload.photoUrl = body.photoUrl;

    const updated = await this.staffRepo.update(staff.id, updatePayload);
    return updated;
  }

  @Patch('me/avatar')
  @Roles('ADMIN', 'STAF')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload atau perbarui avatar profil staf login (PATCH)',
    description:
      'Mengunggah file gambar avatar (JPEG, PNG, WebP hingga 5MB) untuk staf yang sedang login.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas gambar avatar (JPEG, PNG, WebP max 5MB)',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async uploadMyAvatar(
    @CurrentUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Berkas gambar (file) wajib disertakan');
    }
    return this.avatarService.uploadAvatar(user.id, file.buffer);
  }

  @Post('me/avatar')
  @Roles('ADMIN', 'STAF')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload atau perbarui avatar profil staf login (POST Alias)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas gambar avatar (JPEG, PNG, WebP max 5MB)',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async uploadMyAvatarPost(
    @CurrentUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.uploadMyAvatar(user, file);
  }

  @Get('me/credentials')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Melihat kredensial legalitas staf yang sedang login (SIP/STR)',
    description:
      'Mengambil riwayat Surat Izin Praktik (SIP) dan Surat Tanda Registrasi (STR) untuk staf yang login.',
  })
  @ApiOkResponse({
    description: 'Daftar kredensial staf login berhasil diambil',
  })
  async getMyCredentials(@CurrentUser() user: any) {
    const staff = await this.staffRepo.findByUserId(user.id);
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Profil staf belum terdaftar untuk akun ini.',
      });
    }
    return this.staffRepo.findCredentials(staff.id);
  }

  @Post('me/credentials')
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Menambahkan kredensial SIP/STR untuk staf yang sedang login',
    description:
      'Mencatat nomor izin praktik dan masa berlaku legalitas tenaga medis staf yang sedang login.',
  })
  @ApiCreatedResponse({ description: 'Kredensial berhasil dicatat' })
  async addMyCredential(
    @CurrentUser() user: any,
    @Body() body: CreateCredentialDto,
  ) {
    const staff = await this.staffRepo.findByUserId(user.id);
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Profil staf belum terdaftar untuk akun ini.',
      });
    }
    return this.staffRepo.addCredential(staff.id, body);
  }

  @Patch('me/credentials/:credentialId')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Memperbarui kredensial SIP/STR staf login',
    description:
      'Mengubah nomor izin praktik, penerbit, masa berlaku, atau status legalitas staf login.',
  })
  @ApiParam({
    name: 'credentialId',
    description: 'ID unik kredensial',
  })
  @ApiOkResponse({ description: 'Kredensial berhasil diperbarui' })
  async updateMyCredential(
    @CurrentUser() user: any,
    @Param('credentialId') credentialId: string,
    @Body() body: UpdateCredentialDto,
  ) {
    const staff = await this.staffRepo.findByUserId(user.id);
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Profil staf belum terdaftar untuk akun ini.',
      });
    }
    const cred = await this.staffRepo.findCredentialById(credentialId);
    if (!cred || cred.staffProfileId !== staff.id) {
      throw new NotFoundException('Kredensial tidak ditemukan');
    }
    return this.staffRepo.updateCredential(credentialId, body);
  }

  @Delete('me/credentials/:credentialId')
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus kredensial SIP/STR staf login',
  })
  @ApiParam({
    name: 'credentialId',
    description: 'ID unik kredensial',
  })
  @ApiNoContentResponse({ description: 'Kredensial berhasil dihapus' })
  async deleteMyCredential(
    @CurrentUser() user: any,
    @Param('credentialId') credentialId: string,
  ) {
    const staff = await this.staffRepo.findByUserId(user.id);
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Profil staf belum terdaftar untuk akun ini.',
      });
    }
    const cred = await this.staffRepo.findCredentialById(credentialId);
    if (!cred || cred.staffProfileId !== staff.id) {
      throw new NotFoundException('Kredensial tidak ditemukan');
    }
    await this.staffRepo.deleteCredential(credentialId);
  }

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
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Memperbarui data profil staf (Admin / Staf Pemilik)',
    description:
      'Mengubah nama gelar, profesi, nomor kontak, atau status aktif staf. Staf hanya dapat mengubah profil miliknya sendiri.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
    example: '96ab2405-5608-4ad5-ad76-7a4706bad8db',
  })
  @ApiOkResponse({ description: 'Data staf berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Staf tidak ditemukan' })
  @ApiUnprocessableEntityResponse({ description: 'Validasi pembaruan gagal' })
  async updateStaff(
    @Param('id') id: string,
    @Body() body: UpdateStaffDto,
    @CurrentUser() user: any,
  ) {
    const existing = await this.staffRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }

    if (user.systemRole !== 'ADMIN' && existing.userId !== user.id) {
      throw new ForbiddenException(
        'Akses ditolak: Anda hanya berwenang memperbarui data profil staf Anda sendiri',
      );
    }

    const updated = await this.staffRepo.update(id, body);
    if (!updated) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }
    return updated;
  }

  @Patch(':id/avatar')
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload atau perbarui avatar staf berdasarkan ID staf (PATCH Admin)',
    description:
      'Administrator mengunggah foto profil baru untuk staf/dokter berdasarkan UUID profil staf.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas gambar avatar (JPEG, PNG, WebP max 5MB)',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async uploadStaffAvatar(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Berkas gambar (file) wajib disertakan');
    }
    const staff = await this.staffRepo.findById(id);
    if (!staff) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }
    if (!staff.userId) {
      throw new BadRequestException(
        'Staf ini tidak terhubung dengan akun pengguna sistem',
      );
    }
    return this.avatarService.uploadAvatar(staff.userId, file.buffer);
  }

  @Post(':id/avatar')
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload atau perbarui avatar staf berdasarkan ID staf (POST Alias Admin)',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Berkas gambar avatar (JPEG, PNG, WebP max 5MB)',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async uploadStaffAvatarPost(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.uploadStaffAvatar(id, file);
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
  @Roles('ADMIN', 'STAF')
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
    @CurrentUser() user: any,
  ) {
    const staff = await this.staffRepo.findById(id);
    if (!staff) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }
    if (user.systemRole !== 'ADMIN' && staff.userId !== user.id) {
      throw new ForbiddenException(
        'Akses ditolak: Anda hanya berwenang menambahkan kredensial untuk profil Anda sendiri',
      );
    }
    return this.staffRepo.addCredential(id, body);
  }

  @Patch(':id/credentials/:credentialId')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary:
      'Memperbarui kredensial SIP/STR staf berdasarkan ID staf dan ID kredensial',
    description:
      'Mengubah rincian izin praktik, nomor registrasi, masa berlaku, atau status legalitas.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
  })
  @ApiParam({
    name: 'credentialId',
    description: 'ID unik kredensial',
  })
  @ApiOkResponse({ description: 'Kredensial berhasil diperbarui' })
  @ApiNotFoundResponse({ description: 'Staf atau kredensial tidak ditemukan' })
  async updateCredential(
    @Param('id') id: string,
    @Param('credentialId') credentialId: string,
    @Body() body: UpdateCredentialDto,
    @CurrentUser() user: any,
  ) {
    const staff = await this.staffRepo.findById(id);
    if (!staff) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }
    if (user.systemRole !== 'ADMIN' && staff.userId !== user.id) {
      throw new ForbiddenException(
        'Akses ditolak: Anda hanya berwenang mengubah kredensial profil Anda sendiri',
      );
    }
    const cred = await this.staffRepo.findCredentialById(credentialId);
    if (!cred || cred.staffProfileId !== id) {
      throw new NotFoundException(
        `Kredensial dengan ID ${credentialId} tidak ditemukan untuk staf ini`,
      );
    }
    return this.staffRepo.updateCredential(credentialId, body);
  }

  @Delete(':id/credentials/:credentialId')
  @Roles('ADMIN', 'STAF')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Menghapus kredensial SIP/STR staf berdasarkan ID',
  })
  @ApiParam({
    name: 'id',
    description: 'ID unik staf klinis',
  })
  @ApiParam({
    name: 'credentialId',
    description: 'ID unik kredensial',
  })
  @ApiNoContentResponse({ description: 'Kredensial berhasil dihapus' })
  @ApiNotFoundResponse({ description: 'Staf atau kredensial tidak ditemukan' })
  async deleteCredential(
    @Param('id') id: string,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: any,
  ) {
    const staff = await this.staffRepo.findById(id);
    if (!staff) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }
    if (user.systemRole !== 'ADMIN' && staff.userId !== user.id) {
      throw new ForbiddenException(
        'Akses ditolak: Anda hanya berwenang menghapus kredensial profil Anda sendiri',
      );
    }
    const cred = await this.staffRepo.findCredentialById(credentialId);
    if (!cred || cred.staffProfileId !== id) {
      throw new NotFoundException(
        `Kredensial dengan ID ${credentialId} tidak ditemukan untuk staf ini`,
      );
    }
    await this.staffRepo.deleteCredential(credentialId);
  }
}

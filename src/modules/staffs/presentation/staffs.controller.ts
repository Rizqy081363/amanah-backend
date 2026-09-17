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
  ApiOperation,
  ApiResponse,
  ApiTags,
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
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'staffs', version: '1' })
export class StaffsController {
  constructor(
    @Inject(STAFF_REPOSITORY)
    private readonly staffRepo: StaffRepository,
  ) {}

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Menambahkan profil staf klinis baru (Admin)' })
  @ApiResponse({ status: 201, description: 'Staf berhasil didaftarkan' })
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
    summary:
      'Mendapatkan profil dan data Kartu ID digital staf yang sedang login',
  })
  async getMyProfile(@CurrentUser() user: any) {
    return this.staffRepo.findByUserId(user.id);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Mendapatkan daftar seluruh staf klinis (Admin)' })
  async getAllStaffs() {
    return this.staffRepo.findAll();
  }

  @Get('profession/:profession')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Filter staf berdasarkan profesi (dokter, bidan, perawat)',
  })
  async getStaffsByProfession(@Param('profession') profession: string) {
    return this.staffRepo.findByProfession(profession);
  }

  @Get(':id')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({ summary: 'Mendapatkan detail profil staf berdasarkan ID' })
  async getStaffById(@Param('id') id: string) {
    const staff = await this.staffRepo.findById(id);
    if (!staff) {
      throw new NotFoundException(`Staf dengan ID ${id} tidak ditemukan`);
    }
    return staff;
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Memperbarui data profil staf (Admin)' })
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
  @ApiOperation({ summary: 'Menonaktifkan staf (Admin)' })
  async deleteStaff(@Param('id') id: string) {
    await this.staffRepo.delete(id);
  }

  @Get(':id/credentials')
  @Roles('ADMIN', 'STAF')
  @ApiOperation({
    summary: 'Melihat daftar legalitas/kredensial staf (SIP, STR)',
  })
  async getCredentials(@Param('id') id: string) {
    return this.staffRepo.findCredentials(id);
  }

  @Post(':id/credentials')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Menambahkan kredensial SIP/STR untuk staf' })
  async addCredential(
    @Param('id') id: string,
    @Body() body: CreateCredentialDto,
  ) {
    return this.staffRepo.addCredential(id, body);
  }
}

import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { Roles } from '../../../common/auth/roles.decorator';
import { RolesGuard } from '../../../common/auth/roles.guard';
import {
  STAFF_REPOSITORY,
  StaffRepository,
} from '../domain/repositories/staff.repository';

@ApiTags('Staffs (Pegawai Klinis & Kartu ID Digital)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'staffs', version: '1' })
export class StaffsController {
  constructor(
    @Inject(STAFF_REPOSITORY)
    private readonly staffRepo: StaffRepository,
  ) {}

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
}

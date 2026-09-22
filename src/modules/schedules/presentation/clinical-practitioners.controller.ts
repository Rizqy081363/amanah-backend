import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { ClinicalPractitionersQueryDto } from './dto/clinical-practitioners-query.dto';

@ApiTags('Clinical Practitioners (Ketersediaan Janji Temu Pasien)')
@Controller({ path: 'clinical/practitioners', version: '1' })
export class ClinicalPractitionersController {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'Mendapatkan daftar dokter dan ketersediaan praktik untuk janji temu pasien',
    description:
      'Menampilkan dokter aktif, spesialisasi, ruangan, estimasi jadwal, dan status ketersediaan slot pada tanggal yang diminta.',
  })
  @ApiOkResponse({
    description: 'Daftar dokter dan ketersediaan berhasil diambil',
  })
  async getPractitioners(@Query() query: ClinicalPractitionersQueryDto) {
    const data = await this.scheduleRepo.findClinicalPractitioners(query);
    return {
      success: true,
      data,
    };
  }
}

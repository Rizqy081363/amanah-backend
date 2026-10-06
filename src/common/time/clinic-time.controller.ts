import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ClinicTimeService } from './clinic-time.service';

@ApiTags('Time')
@Controller({ path: 'time', version: '1' })
export class ClinicTimeController {
  constructor(private readonly clinicTimeService: ClinicTimeService) {}

  @Public()
  @Get('current')
  @ApiOperation({ summary: 'Mendapatkan SSOT waktu dan tanggal operasional klinik' })
  @ApiOkResponse({ description: 'Waktu operasional klinik berhasil diambil' })
  async getCurrentTime() {
    const operationalHours = await this.clinicTimeService.getOperationalHours();
    return {
      clinicTimezone: this.clinicTimeService.getTimezone(),
      today: this.clinicTimeService.today(),
      nowIso: this.clinicTimeService.nowInstant().toString(),
      currentTime: this.clinicTimeService.getCurrentTimeString(),
      operationalHours,
    };
  }
}

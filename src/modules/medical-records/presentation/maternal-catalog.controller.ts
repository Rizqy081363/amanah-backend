import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaternalCatalogService } from '../application/services/maternal-catalog.service';

@ApiTags('Maternal Intake Catalogs (Dynamic Questionnaire & Master Options)')
@Controller({ path: 'medical-records/maternal/catalogs', version: '1' })
export class MaternalCatalogController {
  constructor(private readonly catalogService: MaternalCatalogService) {}

  @Get('questions')
  @ApiOperation({
    summary:
      'Mendapatkan daftar kuesioner skrining anamnesis maternal dinamis beserta opsi jawaban',
  })
  @ApiOkResponse({
    description: 'Daftar pertanyaan skrining dinamis berhasil diambil',
  })
  async getQuestions() {
    const data = await this.catalogService.getQuestions();
    return {
      success: true,
      data,
    };
  }

  @Get('conditions')
  @ApiOperation({
    summary:
      'Mendapatkan daftar master riwayat penyakit maternal yang diskrining',
  })
  @ApiOkResponse({
    description: 'Daftar kondisi kesehatan berhasil diambil',
  })
  async getConditions() {
    const data = await this.catalogService.getConditions();
    return {
      success: true,
      data,
    };
  }

  @Get('reference-options')
  @ApiOperation({
    summary:
      'Mendapatkan referensi standar pendidikan, agama, golongan darah, dan status tetanus',
  })
  @ApiOkResponse({
    description: 'Opsi referensi formulir persalinan berhasil diambil',
  })
  async getReferenceOptions() {
    const data = await this.catalogService.getReferenceOptions();
    return {
      success: true,
      data,
    };
  }
}

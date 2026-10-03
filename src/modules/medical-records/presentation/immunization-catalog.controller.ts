import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImmunizationCatalogService } from '../application/services/immunization-catalog.service';

@ApiTags('Immunization Intake Catalogs (Vaccine Master Schedule)')
@Controller({ path: 'medical-records/immunization/catalogs', version: '1' })
export class ImmunizationCatalogController {
  constructor(private readonly catalogService: ImmunizationCatalogService) {}

  @Get('vaccines')
  @ApiOperation({
    summary: 'Mendapatkan daftar katalog master vaksin imunisasi anak',
  })
  @ApiOkResponse({
    description: 'Daftar master vaksin berhasil diambil',
  })
  async getVaccines() {
    const data = await this.catalogService.getVaccines();
    return {
      success: true,
      data,
    };
  }
}

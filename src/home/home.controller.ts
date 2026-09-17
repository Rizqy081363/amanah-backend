import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { HomeService } from './home.service';

@ApiTags('Home')
@Controller()
export class HomeController {
  constructor(private readonly service: HomeService) {}

  @Get()
  @ApiOperation({
    summary: 'Informasi metadata server Amanah Healthcare',
    description: 'Mengembalikan nama aplikasi backend yang sedang berjalan.',
  })
  @ApiOkResponse({
    description: 'Metadata aplikasi berhasil diambil',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Amanah Healthcare Backend' },
      },
    },
  })
  appInfo() {
    return this.service.appInfo();
  }
}

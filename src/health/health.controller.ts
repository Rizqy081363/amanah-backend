import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipRateLimit } from '../common/throttling';
import { HealthService } from './health.service';

@ApiTags('Health')
@SkipRateLimit()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({
    summary: 'Liveness probe server',
    description:
      'Pengecekan apakah proses aplikasi NestJS aktif dan merespons permintaan.',
  })
  @ApiOkResponse({
    description: 'Server dalam keadaan aktif (up)',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'up' },
      },
    },
  })
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe ketergantungan sistem',
    description:
      'Pengecekan kesiapan koneksi database PostgreSQL dan Redis cache.',
  })
  @ApiOkResponse({
    description: 'Seluruh dependensi (Postgres, Redis) terhubung normal',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'up' },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'database' },
              status: { type: 'string', example: 'up' },
            },
          },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Salah satu layanan dependensi gagal terhubung',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'down' },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'database' },
              status: { type: 'string', example: 'down' },
              detail: { type: 'string', example: 'Connection refused' },
            },
          },
        },
      },
    },
  })
  async getReadiness() {
    const readiness = await this.healthService.getReadiness();

    if (readiness.status === 'down') {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }
}

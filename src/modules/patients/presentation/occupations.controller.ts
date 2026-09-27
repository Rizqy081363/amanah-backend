import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { occupations } from '../../../database/schema';

@ApiTags('Occupations')
@Controller({ path: 'occupations', version: '1' })
export class OccupationsController {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Mendapatkan daftar pekerjaan standar untuk formulir pasien',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar master pekerjaan',
  })
  async findAll() {
    const list = await this.db.query.occupations.findMany({
      where: eq(occupations.isActive, true),
      orderBy: [asc(occupations.displayOrder), asc(occupations.name)],
    });

    return {
      success: true,
      data: list.map((occ) => ({
        id: occ.id,
        code: occ.code,
        name: occ.name,
        description: occ.description,
        displayOrder: occ.displayOrder,
      })),
    };
  }
}

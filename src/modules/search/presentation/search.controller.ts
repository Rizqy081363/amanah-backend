import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { registry } from '../catalog';
import { runSearch } from '../engine';
import { SearchQueryDto } from './dto/search-query.dto';
import { enrichPatientsWithAffiliates } from './helpers/patient-affiliate-enricher';

@ApiTags('search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  @Get(':entity')
  @ApiOperation({ summary: 'Generic catalog search endpoint' })
  async search(
    @Param('entity') entity: string,
    @Query() query: SearchQueryDto,
  ) {
    const catalog = registry[entity];
    if (!catalog) {
      throw new NotFoundException(`Unknown search entity: ${entity}`);
    }

    let sort: { key: string; dir: 'asc' | 'desc' } | undefined = undefined;
    if (query.sort?.trim()) {
      const [key, dir] = query.sort.trim().split(':');
      if (!catalog.sorts[key]) {
        throw new BadRequestException(
          `Invalid sort key '${key}'. Allowed sort keys: ${Object.keys(catalog.sorts).join(', ')}`,
        );
      }
      if (dir !== 'asc' && dir !== 'desc') {
        throw new BadRequestException(
          `Invalid sort direction '${dir}'. Must be 'asc' or 'desc'`,
        );
      }
      sort = { key, dir };
    }

    const filters: Record<string, unknown> = {};
    if (query.gender) filters.gender = query.gender;
    if (query.status) filters.status = query.status;
    if (query.bloodType) filters.bloodType = query.bloodType;

    if (query.birthDateFrom || query.birthDateTo) {
      filters.birthDate = {
        from: query.birthDateFrom,
        to: query.birthDateTo,
      };
    }

    if (query.registeredAtFrom || query.registeredAtTo) {
      filters.registeredAt = {
        from: query.registeredAtFrom,
        to: query.registeredAtTo,
      };
    }

    const result = await runSearch(
      this.db,
      catalog,
      {
        q: query.q,
        page: query.page ?? 1,
        limit: query.limit ?? catalog.pagination.defaultLimit,
        sort,
        filters,
      },
      {},
    );

    if (entity === 'patients') {
      const enrichedData = await enrichPatientsWithAffiliates(
        this.db,
        result.data,
      );
      return {
        success: true,
        data: enrichedData,
        meta: result.meta,
      };
    }

    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }
}

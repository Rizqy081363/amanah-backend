import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import {
  serviceCategories,
  sessionDefs,
  sessionSchedules,
} from '../../../../database/schema';

@ApiTags('v2 - Catalog')
@Controller({ path: 'catalog', version: '2' })
export class V2CatalogController {
  constructor(@Inject(DRIZZLE_SOURCE) private readonly db: any) {}

  @Get()
  @ApiOperation({
    summary: 'Get active service categories and session definitions',
  })
  @ApiOkResponse({ description: 'Catalog metadata loaded successfully' })
  async getCatalog() {
    const [categories, sessions, schedules] = await Promise.all([
      this.db
        .select()
        .from(serviceCategories)
        .where(eq(serviceCategories.isActive, true))
        .orderBy(asc(serviceCategories.displayOrder)),
      this.db
        .select()
        .from(sessionDefs)
        .where(eq(sessionDefs.isActive, true))
        .orderBy(asc(sessionDefs.sortOrder)),
      this.db
        .select()
        .from(sessionSchedules)
        .where(eq(sessionSchedules.isActive, true))
        .orderBy(asc(sessionSchedules.dow), asc(sessionSchedules.startsAt)),
    ]);

    return {
      success: true,
      data: {
        categories: categories.map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          codePrefix: c.codePrefix || 'Q',
          description: c.description,
        })),
        sessions: sessions.map((s: any) => ({
          id: s.id,
          code: s.code,
          labelKey: s.labelKey,
          codePrefix: s.codePrefix,
          sortOrder: s.sortOrder,
        })),
        schedules: schedules.map((sch: any) => ({
          id: sch.id,
          sessionId: sch.sessionId,
          dow: sch.dow,
          startsAt: sch.startsAt,
          endsAt: sch.endsAt,
        })),
      },
    };
  }
}

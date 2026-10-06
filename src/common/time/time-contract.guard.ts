import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AllConfigType } from '../../config/config.type';
import { POSTGRES_POOL } from '../../database/drizzle/drizzle.constants';

export function sameZoneNow(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  try {
    const now = new Date();
    const fmtA = new Intl.DateTimeFormat('en-US', {
      timeZone: a,
      timeZoneName: 'longOffset',
    }).format(now);
    const fmtB = new Intl.DateTimeFormat('en-US', {
      timeZone: b,
      timeZoneName: 'longOffset',
    }).format(now);
    return fmtA === fmtB;
  } catch {
    return false;
  }
}

@Injectable()
export class TimeContractGuard implements OnApplicationBootstrap {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly config: ConfigService<AllConfigType, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const t = this.config.getOrThrow('time', { infer: true });

    const { rows } = await this.pool.query<{ tz: string }>(
      "SELECT current_setting('TimeZone') AS tz",
    );
    if (!rows[0] || rows[0].tz !== t.dbTimezone) {
      const actual = rows[0]?.tz;
      throw new Error(
        `DB session TimeZone=${actual}, expected ${t.dbTimezone}`,
      );
    }

    const proc = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!sameZoneNow(proc, t.processTimezone)) {
      throw new Error(`Process TZ=${proc}, expected ${t.processTimezone}`);
    }
  }
}

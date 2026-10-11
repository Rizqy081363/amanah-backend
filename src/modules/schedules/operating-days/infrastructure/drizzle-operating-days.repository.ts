import { ClinicConfigService } from '@common/clinic-config';
import { RedisService } from '@common/redis/redis.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import { masterDays } from '@database/schema';
import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { OperatingDayEntity } from '../domain/entities/operating-day.entity';
import {
  OperatingDaysRepository,
  UpdateOperatingDayItem,
} from '../domain/repositories/operating-days.repository';

@Injectable()
export class DrizzleOperatingDaysRepository implements OperatingDaysRepository {
  private readonly logger = new Logger(DrizzleOperatingDaysRepository.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicConfigService: ClinicConfigService,
    @Optional()
    @Inject(RedisService)
    private readonly redisService?: RedisService,
  ) {}

  private async invalidateCaches(): Promise<void> {
    this.clinicConfigService.invalidateCache();
    if (!this.redisService) return;
    try {
      await this.redisService.invalidateTags(
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'booking',
      );
    } catch {
      // Safe fallback when redis is unreachable
    }
  }

  async findAll(): Promise<OperatingDayEntity[]> {
    const records = await this.db
      .select()
      .from(masterDays)
      .orderBy(asc(masterDays.sortOrder));

    return records.map((r) => ({
      dow: r.dow,
      code: r.code,
      nameId: r.nameId,
      nameEn: r.nameEn,
      shortNameId: r.shortNameId,
      shortNameEn: r.shortNameEn,
      sortOrder: r.sortOrder,
      isWeekend: r.isWeekend,
      isActive: r.isActive,
    }));
  }

  async findByDow(dow: number): Promise<OperatingDayEntity | null> {
    const record = await this.db.query.masterDays.findFirst({
      where: eq(masterDays.dow, dow),
    });

    if (!record) return null;

    return {
      dow: record.dow,
      code: record.code,
      nameId: record.nameId,
      nameEn: record.nameEn,
      shortNameId: record.shortNameId,
      shortNameEn: record.shortNameEn,
      sortOrder: record.sortOrder,
      isWeekend: record.isWeekend,
      isActive: record.isActive,
    };
  }

  async batchUpdateStatus(
    items: UpdateOperatingDayItem[],
    executor: any = this.db,
  ): Promise<void> {
    if (!items || items.length === 0) return;
    const now = new Date().toISOString();

    for (const item of items) {
      await executor
        .update(masterDays)
        .set({
          isActive: item.isActive,
          updatedAt: now,
        })
        .where(eq(masterDays.dow, item.dow));
    }

    if (executor === this.db) {
      await this.invalidateCaches();
    }
  }
}

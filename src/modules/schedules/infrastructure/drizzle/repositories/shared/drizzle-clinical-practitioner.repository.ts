import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../../database/drizzle/drizzle.provider';
import {
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
} from '../../../../../../database/schema';
import type { ClinicalPractitionerEntity } from '../../../../domain/entities/schedule.entity';
import { SchedulePersistenceStatus } from '../../../../domain/schedule-status';
import type { ClinicalPractitionersQueryDto } from '../../../../presentation/dto/clinical-practitioners-query.dto';
import { ScheduleRecordMapper } from '../../mappers/schedule-record.mapper';

@Injectable()
export class DrizzleClinicalPractitionerRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async findClinicalPractitioners(
    query: ClinicalPractitionersQueryDto,
  ): Promise<ClinicalPractitionerEntity[]> {
    const targetDate = query.date || new Date().toISOString().slice(0, 10);

    const pracs = await this.db.query.practitioners.findMany({
      where: eq(practitioners.isAcceptingAppointments, true),
      with: {
        staffProfile: {
          with: {
            clinicUnit: true,
          },
        },
        medicalSpecialty: true,
        clinicRoom: true,
      },
      orderBy: [asc(practitioners.displayName)],
    });

    const results: ClinicalPractitionerEntity[] = [];

    for (const p of pracs) {
      const spec =
        p.medicalSpecialty?.name ||
        p.staffProfile?.clinicUnit?.name ||
        'Dokter Umum';

      if (query.service) {
        const q = query.service.toLowerCase();
        const matchService =
          spec.toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchService) continue;
      }

      const [daySetting, activeLeave] = await Promise.all([
        this.db.query.practitionerScheduleDaySettings.findFirst({
          where: and(
            eq(practitionerScheduleDaySettings.practitionerId, p.id),
            eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
          ),
        }),
        this.db.query.practitionerLeavePeriods.findFirst({
          where: and(
            eq(practitionerLeavePeriods.practitionerId, p.id),
            lte(practitionerLeavePeriods.startDate, targetDate),
            gte(practitionerLeavePeriods.endDate, targetDate),
          ),
        }),
      ]);

      const isCuti = Boolean(daySetting?.isLeave || activeLeave);

      const openSessions =
        await this.db.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(practitionerScheduleSessions.practitionerId, p.id),
            eq(practitionerScheduleSessions.scheduleDate, targetDate),
            eq(
              practitionerScheduleSessions.status,
              SchedulePersistenceStatus.OPEN,
            ),
            sql`available_slots > 0`,
          ),
        });

      const isAvailable = !isCuti && openSessions.length > 0;
      const location = p.clinicRoom
        ? `${p.clinicRoom.name}${p.clinicRoom.location ? `, ${p.clinicRoom.location}` : ''}`
        : 'Poli Umum, Ruang 101';

      results.push({
        id: p.id,
        name: p.staffProfile?.fullName || p.displayName || 'Dokter Amanah',
        spec,
        avatar: ScheduleRecordMapper.toAvatarUrl(p.staffProfile),
        location,
        rating: p.rating ? String(p.rating) : '5.0',
        tags: p.tags?.length ? p.tags : [spec],
        schedule: 'Senin - Sabtu (07:30 - 17:30)',
        is_available: isAvailable,
      });
    }

    return results;
  }
}

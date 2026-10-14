import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  practitioners,
  shiftExceptions,
} from '@database/schema';
import type { ClinicalPractitionerEntity } from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import type { ClinicalPractitionersQueryDto } from '@modules/schedules/presentation/dto/clinical-practitioners-query.dto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';

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
    const targetDow = new Date(targetDate).getDay();

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

      const [activeLeave, assignedRoster, extraShift] = await Promise.all([
        this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.doctorId, p.id),
            eq(shiftExceptions.serviceDate, targetDate),
            eq(shiftExceptions.type, 'leave'),
          ),
        }),
        this.db.query.doctorAssignments.findFirst({
          where: and(
            eq(doctorAssignments.doctorId, p.id),
            eq(doctorAssignments.isActive, true),
            or(
              eq(doctorAssignments.dow, targetDow),
              isNull(doctorAssignments.dow),
            ),
          ),
        }),
        this.db.query.shiftExceptions.findFirst({
          where: and(
            eq(shiftExceptions.doctorId, p.id),
            eq(shiftExceptions.serviceDate, targetDate),
            eq(shiftExceptions.type, 'extra'),
          ),
        }),
      ]);

      const isOnLeave = Boolean(activeLeave);
      const isAvailable =
        (!isOnLeave && Boolean(assignedRoster)) || Boolean(extraShift);
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

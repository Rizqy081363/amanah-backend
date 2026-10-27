import { Inject, Injectable, Optional } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicUnits,
  medicalSpecialties,
  practitioners,
  staffProfiles,
} from '../../../../database/schema';
import { AppointmentPoliklinikResolver } from '../../domain/services/appointment-poliklinik.resolver';
import {
  QueueNavigationDoctorDto,
  QueueNavigationResponseDto,
  QueueNavigationUnitDto,
} from '../../presentation/dto/queue-navigation-response.dto';
import { AppointmentRecordMapper } from './appointment-record.mapper';
import { APPOINTMENT_RELATIONS } from './appointment-relations.constant';

@Injectable()
export class AppointmentQueueNavigationService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional()
    private readonly poliklinikResolver?: AppointmentPoliklinikResolver,
  ) {}

  async getNavigation(
    targetDate: string,
    session?: string,
  ): Promise<QueueNavigationResponseDto> {
    if (this.poliklinikResolver) {
      await this.poliklinikResolver.loadFromDatabase();
    }

    const unitsData = await this.db
      .select({
        id: clinicUnits.id,
        code: clinicUnits.code,
        name: clinicUnits.name,
        queuePrefix: clinicUnits.queuePrefix,
        unitType: clinicUnits.unitType,
      })
      .from(clinicUnits)
      .where(eq(clinicUnits.isActive, true));

    // Focus on outpatient/clinical units (like poli_umum, poli_kia)
    const clinicalUnits = unitsData.filter(
      (u) =>
        u.code.startsWith('poli_') ||
        u.unitType === 'polyclinic' ||
        u.unitType === 'emergency',
    );
    const activeUnits = clinicalUnits.length > 0 ? clinicalUnits : unitsData;

    const doctorsData = await this.db
      .select({
        id: practitioners.id,
        name: staffProfiles.fullName,
        displayName: practitioners.displayName,
        primaryUnitId: staffProfiles.primaryUnitId,
        avatarUrl: staffProfiles.avatarUrl,
        specialty: medicalSpecialties.name,
      })
      .from(practitioners)
      .innerJoin(
        staffProfiles,
        eq(practitioners.staffProfileId, staffProfiles.id),
      )
      .leftJoin(
        medicalSpecialties,
        eq(practitioners.specialtyId, medicalSpecialties.id),
      );

    const dayAppointments = await this.db.query.appointments.findMany({
      where: eq(appointments.scheduledDate, targetDate),
      with: APPOINTMENT_RELATIONS,
    });

    const filteredAppointments = session
      ? dayAppointments.filter((apt) => {
          const aptSession = AppointmentRecordMapper.resolveSession(apt);
          return aptSession === session;
        })
      : dayAppointments;

    const units: QueueNavigationUnitDto[] = [];

    for (const unit of activeUnits) {
      const unitAppointments = filteredAppointments.filter((apt) => {
        const resolved = this.poliklinikResolver
          ? this.poliklinikResolver.resolveSync(apt, unit.id)
          : null;
        if (resolved?.poliklinikId) {
          return resolved.poliklinikId === unit.id;
        }
        return (
          apt.clinicRoom?.unitId === unit.id ||
          apt.practitioner?.staffProfile?.primaryUnitId === unit.id
        );
      });

      const activeQueues = unitAppointments.filter((a) =>
        ['booked', 'waiting', 'in_service'].includes(a.status),
      ).length;

      const unassignedCount = unitAppointments.filter(
        (a) => !a.practitionerId,
      ).length;

      const unitDoctorMap = new Map<string, QueueNavigationDoctorDto>();

      for (const doc of doctorsData) {
        if (doc.primaryUnitId === unit.id) {
          unitDoctorMap.set(doc.id, {
            id: doc.id,
            name: doc.name || doc.displayName,
            specialty: doc.specialty || null,
            avatarUrl: doc.avatarUrl || null,
            totalAppointments: 0,
            activeQueues: 0,
            waitingCount: 0,
            inServiceCount: 0,
            completedCount: 0,
          });
        }
      }

      for (const apt of unitAppointments) {
        if (apt.practitionerId && !unitDoctorMap.has(apt.practitionerId)) {
          const docInfo = doctorsData.find((d) => d.id === apt.practitionerId);
          unitDoctorMap.set(apt.practitionerId, {
            id: apt.practitionerId,
            name:
              docInfo?.name ||
              docInfo?.displayName ||
              apt.practitioner?.displayName ||
              'Dokter',
            specialty: docInfo?.specialty || null,
            avatarUrl: docInfo?.avatarUrl || null,
            totalAppointments: 0,
            activeQueues: 0,
            waitingCount: 0,
            inServiceCount: 0,
            completedCount: 0,
          });
        }
      }

      for (const apt of unitAppointments) {
        if (apt.practitionerId && unitDoctorMap.has(apt.practitionerId)) {
          const docDto = unitDoctorMap.get(apt.practitionerId)!;
          docDto.totalAppointments += 1;
          if (apt.status === 'in_service') {
            docDto.inServiceCount += 1;
            docDto.activeQueues += 1;
          } else if (apt.status === 'waiting' || apt.status === 'booked') {
            docDto.waitingCount += 1;
            docDto.activeQueues += 1;
          } else if (apt.status === 'completed') {
            docDto.completedCount += 1;
          }
        }
      }

      const sortedDoctors = Array.from(unitDoctorMap.values()).sort(
        (a, b) =>
          b.activeQueues - a.activeQueues || a.name.localeCompare(b.name),
      );

      units.push({
        id: unit.id,
        code: unit.code,
        name: unit.name,
        queuePrefix: unit.queuePrefix || null,
        totalAppointments: unitAppointments.length,
        activeQueues,
        unassignedCount,
        doctors: sortedDoctors,
      });
    }

    return {
      date: targetDate,
      session: session || null,
      units,
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  clinicRooms,
  clinicServices,
  clinicUnits,
  doctorAssignments,
} from '../../../../database/schema';

export interface ResolvedPoliklinik {
  poliklinikId: string;
  poliklinikName: string;
}

@Injectable()
export class AppointmentPoliklinikResolver {
  private categoryUnitMap = new Map<string, ResolvedPoliklinik>();
  private serviceUnitMap = new Map<string, ResolvedPoliklinik>();
  private unitMap = new Map<string, ResolvedPoliklinik>();
  private defaultUnit: ResolvedPoliklinik = {
    poliklinikId: '',
    poliklinikName: '',
  };
  private isLoaded = false;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async loadFromDatabase(): Promise<void> {
    const units = await this.db
      .select({
        id: clinicUnits.id,
        name: clinicUnits.name,
      })
      .from(clinicUnits)
      .where(eq(clinicUnits.isActive, true));

    this.unitMap.clear();
    for (const u of units) {
      this.unitMap.set(u.id, { poliklinikId: u.id, poliklinikName: u.name });
    }

    if (units.length > 0) {
      this.defaultUnit = {
        poliklinikId: units[0].id,
        poliklinikName: units[0].name,
      };
    }

    const assignments = await this.db
      .select({
        categoryId: doctorAssignments.categoryId,
        unitId: clinicUnits.id,
        unitName: clinicUnits.name,
      })
      .from(doctorAssignments)
      .innerJoin(
        clinicRooms,
        eq(doctorAssignments.preferredRoomId, clinicRooms.id),
      )
      .innerJoin(clinicUnits, eq(clinicRooms.unitId, clinicUnits.id))
      .where(eq(doctorAssignments.isActive, true));

    this.categoryUnitMap.clear();
    for (const a of assignments) {
      if (a.categoryId && a.unitId && a.unitName) {
        this.categoryUnitMap.set(a.categoryId, {
          poliklinikId: a.unitId,
          poliklinikName: a.unitName,
        });
      }
    }

    const services = await this.db
      .select({
        id: clinicServices.id,
        categoryId: clinicServices.serviceCategoryId,
      })
      .from(clinicServices)
      .where(eq(clinicServices.isActive, true));

    this.serviceUnitMap.clear();
    for (const s of services) {
      if (s.categoryId && this.categoryUnitMap.has(s.categoryId)) {
        const resolved = this.categoryUnitMap.get(s.categoryId);
        if (resolved) {
          this.serviceUnitMap.set(s.id, resolved);
        }
      }
    }

    this.isLoaded = true;
  }

  async resolve(
    apt: any,
    poliklinikIdOverride?: string,
  ): Promise<ResolvedPoliklinik> {
    if (!this.isLoaded) {
      await this.loadFromDatabase();
    }

    if (apt.clinicRoom?.clinicUnit?.name) {
      return {
        poliklinikId:
          apt.clinicRoom.clinicUnit.id ||
          apt.clinicRoom.unitId ||
          poliklinikIdOverride ||
          '',
        poliklinikName: apt.clinicRoom.clinicUnit.name,
      };
    }

    if (apt.practitioner?.clinicRoom?.clinicUnit?.name) {
      return {
        poliklinikId:
          apt.practitioner.clinicRoom.clinicUnit.id ||
          apt.practitioner.clinicRoom.unitId ||
          '',
        poliklinikName: apt.practitioner.clinicRoom.clinicUnit.name,
      };
    }

    if (apt.practitioner?.staffProfile?.clinicUnit?.name) {
      return {
        poliklinikId:
          apt.practitioner.staffProfile.clinicUnit.id ||
          apt.practitioner.staffProfile.primaryUnitId ||
          '',
        poliklinikName: apt.practitioner.staffProfile.clinicUnit.name,
      };
    }

    if (poliklinikIdOverride && this.unitMap.has(poliklinikIdOverride)) {
      const match = this.unitMap.get(poliklinikIdOverride);
      if (match) return match;
    }

    const serviceId = apt.serviceId || apt.clinicService?.id;
    if (serviceId && this.serviceUnitMap.has(serviceId)) {
      const match = this.serviceUnitMap.get(serviceId);
      if (match) return match;
    }

    const categoryId =
      apt.clinicService?.serviceCategoryId || apt.queueTickets?.[0]?.categoryId;
    if (categoryId && this.categoryUnitMap.has(categoryId)) {
      const match = this.categoryUnitMap.get(categoryId);
      if (match) return match;
    }

    return this.defaultUnit;
  }

  resolveSync(apt: any, poliklinikIdOverride?: string): ResolvedPoliklinik {
    if (apt.clinicRoom?.clinicUnit?.name) {
      return {
        poliklinikId:
          apt.clinicRoom.clinicUnit.id ||
          apt.clinicRoom.unitId ||
          poliklinikIdOverride ||
          '',
        poliklinikName: apt.clinicRoom.clinicUnit.name,
      };
    }

    if (apt.practitioner?.clinicRoom?.clinicUnit?.name) {
      return {
        poliklinikId:
          apt.practitioner.clinicRoom.clinicUnit.id ||
          apt.practitioner.clinicRoom.unitId ||
          '',
        poliklinikName: apt.practitioner.clinicRoom.clinicUnit.name,
      };
    }

    if (apt.practitioner?.staffProfile?.clinicUnit?.name) {
      return {
        poliklinikId:
          apt.practitioner.staffProfile.clinicUnit.id ||
          apt.practitioner.staffProfile.primaryUnitId ||
          '',
        poliklinikName: apt.practitioner.staffProfile.clinicUnit.name,
      };
    }

    if (poliklinikIdOverride && this.unitMap.has(poliklinikIdOverride)) {
      const match = this.unitMap.get(poliklinikIdOverride);
      if (match) return match;
    }

    const serviceId = apt.serviceId || apt.clinicService?.id;
    if (serviceId && this.serviceUnitMap.has(serviceId)) {
      const match = this.serviceUnitMap.get(serviceId);
      if (match) return match;
    }

    const categoryId =
      apt.clinicService?.serviceCategoryId || apt.queueTickets?.[0]?.categoryId;
    if (categoryId && this.categoryUnitMap.has(categoryId)) {
      const match = this.categoryUnitMap.get(categoryId);
      if (match) return match;
    }

    return this.defaultUnit;
  }
}

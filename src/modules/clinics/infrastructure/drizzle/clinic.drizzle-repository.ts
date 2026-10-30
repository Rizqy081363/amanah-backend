import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, or } from 'drizzle-orm';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  clinicalIntakeForms,
  clinicServiceComplaints,
  clinicServices,
  clinicUnits,
  serviceCategories,
} from '../../../../database/schema';
import {
  LayananPoliEntity,
  PoliklinikEntity,
} from '../../domain/entities/clinic.entity';
import { ClinicRepository } from '../../domain/repositories/clinic.repository';
import type { ServiceCategoryCatalogDto } from '../../presentation/dto/service-catalog.dto';

@Injectable()
export class ClinicDrizzleRepository implements ClinicRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redis: RedisService,
  ) {}

  private mapUnitToPoli(r: typeof clinicUnits.$inferSelect): PoliklinikEntity {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      location: r.location || null,
      isActive: r.isActive,
      createdAt: new Date(r.createdAt),
    };
  }

  async createPoliklinik(data: {
    namaPoli: string;
    kodePoli: string;
    deskripsi?: string | null;
    isActive?: boolean;
  }): Promise<PoliklinikEntity> {
    const normalizedCode = data.kodePoli.toLowerCase().replace(/-/g, '_');
    const [record] = await this.db
      .insert(clinicUnits)
      .values({
        code: normalizedCode,
        name: data.namaPoli,
        unitType: 'polyclinic',
        location: data.deskripsi || null,
        isActive: data.isActive ?? true,
      })
      .returning();

    await this.redis.del('clinics:poliklinik:all');
    return this.mapUnitToPoli(record);
  }

  async findAllPoliklinik(): Promise<PoliklinikEntity[]> {
    return this.redis.getOrSet(
      'clinics:poliklinik:all',
      async () => {
        const records = await this.db.query.clinicUnits.findMany({
          where: eq(clinicUnits.isActive, true),
        });
        return records.map((r) => this.mapUnitToPoli(r));
      },
      600, // 10 minutes cache
    );
  }

  async findPoliklinikById(id: string): Promise<PoliklinikEntity | null> {
    const record = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, id),
    });
    if (!record) return null;
    return this.mapUnitToPoli(record);
  }

  async findPoliklinikByKode(kode: string): Promise<PoliklinikEntity | null> {
    const normalized = kode.toLowerCase().replace(/-/g, '_');
    const record = await this.db.query.clinicUnits.findFirst({
      where: or(
        eq(clinicUnits.code, kode.toLowerCase()),
        eq(clinicUnits.code, normalized),
      ),
    });
    if (!record) return null;
    return this.mapUnitToPoli(record);
  }

  async updatePoliklinik(
    id: string,
    data: Partial<PoliklinikEntity>,
  ): Promise<PoliklinikEntity | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.location !== undefined) updateValues.location = data.location;
    if (data.code !== undefined) updateValues.code = data.code;
    if (data.isActive !== undefined) updateValues.isActive = data.isActive;

    const [updated] = await this.db
      .update(clinicUnits)
      .set(updateValues)
      .where(eq(clinicUnits.id, id))
      .returning();

    await this.redis.del('clinics:poliklinik:all');
    return updated ? this.mapUnitToPoli(updated) : null;
  }

  async deletePoliklinik(id: string): Promise<boolean> {
    await this.db
      .update(clinicUnits)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(clinicUnits.id, id));

    await this.redis.del('clinics:poliklinik:all');
    return true;
  }

  async createLayanan(
    poliklinikId: string,
    data: {
      namaLayanan: string;
      deskripsi?: string | null;
      intakeFormId?: string | null;
      medicalFlow?: string;
    },
  ): Promise<LayananPoliEntity> {
    const slug = data.namaLayanan
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 30);
    const code = `srv_${slug}_${Date.now().toString().slice(-4)}`;

    // 1. Resolve parent category under this unit
    const category = await this.db.query.serviceCategories.findFirst({
      where: and(
        eq(serviceCategories.unitId, poliklinikId),
        eq(serviceCategories.isActive, true),
      ),
    });

    // 2. Resolve unit to obtain queue prefix
    const unit = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, poliklinikId),
    });

    const prefix =
      category?.codePrefix ||
      unit?.queuePrefix ||
      data.namaLayanan.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() ||
      'SRV';

    // 3. Resolve intake form if specified
    let intakeFormId = data.intakeFormId || null;
    if (!intakeFormId && data.medicalFlow) {
      const form = await this.db.query.clinicalIntakeForms.findFirst({
        where: or(
          eq(clinicalIntakeForms.code, data.medicalFlow.toLowerCase()),
          eq(clinicalIntakeForms.name, data.medicalFlow),
        ),
      });
      if (form) {
        intakeFormId = form.id;
      }
    }

    const [record] = await this.db
      .insert(clinicServices)
      .values({
        serviceCategoryId: category?.id || null,
        intakeFormId,
        code,
        name: data.namaLayanan,
        description: data.deskripsi || null,
        codePrefix: prefix,
        isBookable: true,
        isActive: true,
      })
      .returning();

    await this.redis.del(`clinics:layanan:poli:${poliklinikId}`);
    await this.redis.del('clinics:catalog');

    return {
      id: record.id,
      poliklinikId,
      name: record.name,
      description: record.description || null,
      intakeFormId: record.intakeFormId || null,
      medicalFlow: data.medicalFlow || null,
      isActive: record.isActive,
      createdAt: new Date(record.createdAt),
    };
  }

  async findLayananByPoliId(
    poliklinikId: string,
  ): Promise<LayananPoliEntity[]> {
    return this.redis.getOrSet(
      `clinics:layanan:poli:${poliklinikId}`,
      async () => {
        const categories = await this.db.query.serviceCategories.findMany({
          where: and(
            eq(serviceCategories.unitId, poliklinikId),
            eq(serviceCategories.isActive, true),
          ),
          with: {
            clinicServices: {
              where: eq(clinicServices.isActive, true),
              orderBy: [asc(clinicServices.displayOrder)],
              with: {
                intakeForm: true,
              },
            },
          },
        });

        const services: LayananPoliEntity[] = [];
        for (const cat of categories) {
          for (const s of cat.clinicServices || []) {
            services.push({
              id: s.id,
              poliklinikId,
              name: s.name,
              description: s.description || null,
              intakeFormId: s.intakeFormId || null,
              medicalFlow: s.intakeForm?.code || null,
              isActive: s.isActive,
              createdAt: new Date(s.createdAt),
            });
          }
        }
        return services;
      },
      600,
    );
  }

  async findLayananById(id: string): Promise<LayananPoliEntity | null> {
    const record = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.id, id),
      with: {
        serviceCategory: true,
        intakeForm: true,
      },
    });
    if (!record) return null;
    return {
      id: record.id,
      poliklinikId: record.serviceCategory?.unitId || '',
      name: record.name,
      description: record.description || null,
      intakeFormId: record.intakeFormId || null,
      medicalFlow: record.intakeForm?.code || null,
      isActive: record.isActive,
      createdAt: new Date(record.createdAt),
    };
  }

  async updateLayanan(
    id: string,
    data: Partial<LayananPoliEntity>,
  ): Promise<LayananPoliEntity | null> {
    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const [updated] = await this.db
      .update(clinicServices)
      .set(updates)
      .where(eq(clinicServices.id, id))
      .returning();

    if (data.poliklinikId) {
      await this.redis.del(`clinics:layanan:poli:${data.poliklinikId}`);
    }

    return updated
      ? {
          id: updated.id,
          poliklinikId: data.poliklinikId || '',
          name: updated.name,
          description: updated.description || null,
          medicalFlow: (data.medicalFlow as any) || null,
          isActive: updated.isActive,
          createdAt: new Date(updated.createdAt),
        }
      : null;
  }

  async deleteLayanan(id: string): Promise<boolean> {
    await this.db
      .update(clinicServices)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(clinicServices.id, id));

    return true;
  }

  async getCatalog(): Promise<ServiceCategoryCatalogDto[]> {
    return this.redis.getOrSet(
      'clinics:catalog',
      async () => {
        const categories = await this.db.query.serviceCategories.findMany({
          where: eq(serviceCategories.isActive, true),
          orderBy: [asc(serviceCategories.displayOrder)],
          with: {
            clinicUnit: true,
            clinicServices: {
              where: eq(clinicServices.isActive, true),
              orderBy: [asc(clinicServices.displayOrder)],
              with: {
                intakeForm: true,
                clinicServiceComplaints: {
                  orderBy: [asc(clinicServiceComplaints.displayOrder)],
                },
              },
            },
          },
        });

        return categories.map((cat) => {
          const poliklinikId = cat.unitId || '';
          const poliklinikName = cat.clinicUnit?.name || cat.name;

          return {
            id: cat.id,
            code: cat.code,
            name: cat.name,
            iconName: cat.iconName || 'folder',
            description: cat.description || null,
            displayOrder: cat.displayOrder,
            poliklinikId,
            poliklinikName,
            services: (cat.clinicServices || []).map((srv) => ({
              id: srv.id,
              code: srv.code,
              name: srv.name,
              prefix: srv.codePrefix,
              description: srv.description || null,
              iconName: srv.iconName || 'stethoscope',
              specialtyCode: srv.specialtyId || null,
              intakeFormId: srv.intakeFormId || null,
              intakeFormCode: srv.intakeForm?.code || null,
              intakeFormName: srv.intakeForm?.name || null,
              medicalFlow: (srv.intakeForm?.code as any) || null,
              displayOrder: srv.displayOrder,
              poliklinikId,
              poliklinikName,
              complaints: (srv.clinicServiceComplaints || []).map(
                (c) => c.complaintText,
              ),
            })),
          };
        });
      },
      300,
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  clinicalIntakeForms,
  clinicServiceCategoryMappings,
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
import { ServiceCategoryCatalogSchema } from '../../presentation/schemas/service-catalog.schema';

type ServiceWithRelations = typeof clinicServices.$inferSelect & {
  intakeForm?: typeof clinicalIntakeForms.$inferSelect | null;
  clinicServiceComplaints?: Array<typeof clinicServiceComplaints.$inferSelect>;
};

type ServiceCategoryWithRelations = typeof serviceCategories.$inferSelect & {
  clinicUnit?: typeof clinicUnits.$inferSelect | null;
  unitMappings?: Array<{
    unitId: string;
    unit?: typeof clinicUnits.$inferSelect | null;
  }>;
  clinicServices?: ServiceWithRelations[];
  serviceMappings?: Array<{
    service?: ServiceWithRelations | null;
  }>;
};

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

  async findLayananByPoliId(
    poliklinikId: string,
  ): Promise<LayananPoliEntity[]> {
    return this.redis.getOrSet(
      `clinics:layanan:poli:${poliklinikId}`,
      async () => {
        const categories = await this.db.query.serviceCategories.findMany({
          where: and(
            or(
              eq(serviceCategories.unitId, poliklinikId),
              isNull(serviceCategories.unitId),
            ),
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
        serviceCategory: {
          with: {
            unitMappings: true,
          },
        },
        intakeForm: true,
      },
    });
    if (!record) return null;
    const cat = record.serviceCategory;
    const resolvedUnitId = cat?.unitId || cat?.unitMappings?.[0]?.unitId || '';
    return {
      id: record.id,
      poliklinikId: resolvedUnitId,
      name: record.name,
      description: record.description || null,
      intakeFormId: record.intakeFormId || null,
      isActive: record.isActive,
      createdAt: new Date(record.createdAt),
    };
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
            unitMappings: {
              with: {
                unit: true,
              },
            },
            clinicServices: {
              where: and(
                eq(clinicServices.isActive, true),
                eq(clinicServices.isBookable, true),
              ),
              orderBy: [asc(clinicServices.displayOrder)],
              with: {
                intakeForm: true,
                clinicServiceComplaints: {
                  orderBy: [asc(clinicServices.displayOrder)],
                },
              },
            },
            serviceMappings: {
              with: {
                service: {
                  with: {
                    intakeForm: true,
                    clinicServiceComplaints: {
                      orderBy: [asc(clinicServices.displayOrder)],
                    },
                  },
                },
              },
            },
          },
        });

        // Filter out categories whose affiliated unit is explicitly inactive
        const operationalCategories = categories.filter(
          (cat) => !cat.clinicUnit || cat.clinicUnit.isActive,
        );

        const mapped: ServiceCategoryCatalogDto[] = (
          operationalCategories as unknown as ServiceCategoryWithRelations[]
        ).map((cat) => {
          const directUnitId = cat.unitId ? [cat.unitId] : [];
          const mappedUnitIds = (cat.unitMappings || []).map((m) => m.unitId);
          const unitIds = Array.from(new Set([...directUnitId, ...mappedUnitIds]));

          const unitsMap = new Map<string, { id: string; name: string }>();
          if (cat.unitId && cat.clinicUnit) {
            unitsMap.set(cat.unitId, { id: cat.unitId, name: cat.clinicUnit.name });
          }
          for (const m of cat.unitMappings || []) {
            if (m.unit && !unitsMap.has(m.unitId)) {
              unitsMap.set(m.unitId, { id: m.unitId, name: m.unit.name });
            }
          }
          const units = Array.from(unitsMap.values());

          const poliklinikId = cat.unitId || unitIds[0] || null;
          const poliklinikName = cat.clinicUnit?.name || units[0]?.name || cat.name;

          const directServices: ServiceWithRelations[] = cat.clinicServices || [];
          const mappedServices: ServiceWithRelations[] = (cat.serviceMappings || [])
            .map((m) => m.service)
            .filter(
              (s): s is ServiceWithRelations =>
                Boolean(s && s.isActive === true && s.isBookable === true),
            );

          const allServicesMap = new Map<string, ServiceWithRelations>();
          for (const s of [...directServices, ...mappedServices]) {
            if (!allServicesMap.has(s.id)) {
              allServicesMap.set(s.id, s);
            }
          }
          const uniqueServices = Array.from(allServicesMap.values()).sort(
            (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
          );

          return {
            id: cat.id,
            code: cat.code,
            name: cat.name,
            iconName: cat.iconName || 'folder',
            description: cat.description || null,
            displayOrder: cat.displayOrder,
            poliklinikId,
            poliklinikName,
            unitIds,
            units,
            services: uniqueServices.map((srv: ServiceWithRelations) => ({
              id: srv.id,
              code: srv.code,
              name: srv.name,
              prefix: srv.codePrefix,
              description: srv.description || null,
              iconName: srv.iconName || 'stethoscope',
              imageUrl: srv.imageUrl || null,
              specialtyCode: srv.specialtyId || null,
              intakeFormId: srv.intakeFormId || null,
              intakeFormCode: srv.intakeForm?.code || null,
              intakeFormName: srv.intakeForm?.name || null,
              displayOrder: srv.displayOrder,
              categoryId: cat.id,
              poliklinikId,
              poliklinikName,
              complaints: (srv.clinicServiceComplaints || []).map(
                (c) => c.complaintText,
              ),
              isBookable: srv.isBookable,
            })),
          };
        });

        // Strict Zod runtime contract validation (fail-fast SSOT)
        return ServiceCategoryCatalogSchema.array().parse(mapped);
      },
      300,
    );
  }
}

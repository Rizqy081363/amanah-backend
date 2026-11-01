import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, or } from 'drizzle-orm';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
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

@Injectable()
export class ClinicDrizzleRepository implements ClinicRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redis: RedisService,
  ) {}

  private mapUnitToPoli(r: any): PoliklinikEntity {
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
          },
        });

        // Filter out categories whose affiliated unit is explicitly inactive
        const operationalCategories = categories.filter(
          (cat) => !cat.clinicUnit || cat.clinicUnit.isActive,
        );

        const mapped: ServiceCategoryCatalogDto[] = operationalCategories.map(
          (cat) => {
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
                displayOrder: srv.displayOrder,
                categoryId: cat.id,
                poliklinikId,
                poliklinikName,
                complaints: (srv.clinicServiceComplaints || []).map(
                  (c: any) => c.complaintText,
                ),
                isBookable: srv.isBookable,
              })),
            };
          },
        );

        // Strict Zod runtime contract validation (fail-fast SSOT)
        return ServiceCategoryCatalogSchema.array().parse(mapped);
      },
      300,
    );
  }
}

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { RedisService } from '../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  clinicalIntakeForms,
  clinicRooms,
  clinicServiceComplaints,
  clinicServices,
  clinicUnits,
  serviceCategories,
} from '../../../database/schema';
import {
  CreateClinicalIntakeFormDto,
  CreateClinicServiceDto,
  CreateFacilityRoomDto,
  CreateFacilityUnitDto,
  CreateServiceCategoryDto,
  UpdateClinicalIntakeFormDto,
  UpdateClinicServiceDto,
  UpdateFacilityRoomDto,
  UpdateFacilityUnitDto,
  UpdateServiceCategoryDto,
} from '../presentation/dto/admin-facilities.dto';

@Injectable()
export class AdminFacilitiesService {
  private readonly logger = new Logger(AdminFacilitiesService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
  ) {}

  private async invalidateCache(): Promise<void> {
    try {
      await Promise.all([
        this.redisService.deleteByPrefix('clinics'),
        this.redisService.invalidateTags('clinics', 'catalog', 'schedule'),
      ]);
    } catch (err) {
      this.logger.warn(`Failed to invalidate clinic facilities cache: ${String(err)}`);
    }
  }

  // ==========================================
  // 1. CLINIC UNITS
  // ==========================================

  async getUnits(): Promise<any[]> {
    const units = await this.db.query.clinicUnits.findMany({
      orderBy: [asc(clinicUnits.name)],
      with: {
        clinicRooms: true,
        serviceCategories: true,
      },
    });

    return units.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      unitType: u.unitType,
      queuePrefix: u.queuePrefix,
      iconName: u.iconName,
      location: u.location,
      floor: u.floor,
      isActive: u.isActive,
      roomCount: u.clinicRooms?.length || 0,
      categoryCount: u.serviceCategories?.length || 0,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  async createUnit(dto: CreateFacilityUnitDto): Promise<any> {
    const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');

    const existing = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.code, normalizedCode),
    });
    if (existing) {
      throw new ConflictException(`Unit dengan kode '${normalizedCode}' sudah digunakan`);
    }

    const [created] = await this.db
      .insert(clinicUnits)
      .values({
        code: normalizedCode,
        name: dto.name.trim(),
        unitType: dto.unitType || 'polyclinic',
        queuePrefix: dto.queuePrefix?.trim() || null,
        iconName: dto.iconName?.trim() || 'building-2',
        location: dto.location?.trim() || null,
        floor: dto.floor?.trim() || null,
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateUnit(id: string, dto: UpdateFacilityUnitDto): Promise<any> {
    const existing = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Unit dengan ID '${id}' tidak ditemukan`);
    }

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.query.clinicUnits.findFirst({
          where: eq(clinicUnits.code, normalizedCode),
        });
        if (duplicate) {
          throw new ConflictException(`Unit dengan kode '${normalizedCode}' sudah digunakan`);
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.unitType !== undefined) updates.unitType = dto.unitType;
    if (dto.queuePrefix !== undefined) updates.queuePrefix = dto.queuePrefix?.trim() || null;
    if (dto.iconName !== undefined) updates.iconName = dto.iconName?.trim() || 'building-2';
    if (dto.location !== undefined) updates.location = dto.location?.trim() || null;
    if (dto.floor !== undefined) updates.floor = dto.floor?.trim() || null;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    const [updated] = await this.db
      .update(clinicUnits)
      .set(updates)
      .where(eq(clinicUnits.id, id))
      .returning();

    await this.invalidateCache();
    return updated;
  }

  async deleteUnit(id: string): Promise<void> {
    const existing = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Unit dengan ID '${id}' tidak ditemukan`);
    }

    await this.db
      .update(clinicUnits)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(clinicUnits.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 2. CLINIC ROOMS
  // ==========================================

  async getRooms(unitId?: string): Promise<any[]> {
    const whereCondition = unitId ? eq(clinicRooms.unitId, unitId) : undefined;
    const rooms = await this.db.query.clinicRooms.findMany({
      where: whereCondition,
      orderBy: [asc(clinicRooms.name)],
      with: {
        clinicUnit: true,
      },
    });

    return rooms.map((r) => ({
      id: r.id,
      unitId: r.unitId,
      unitName: r.clinicUnit?.name || null,
      code: r.code,
      name: r.name,
      location: r.location,
      floor: r.floor,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createRoom(dto: CreateFacilityRoomDto): Promise<any> {
    const unit = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, dto.unitId),
    });
    if (!unit) {
      throw new NotFoundException(`Unit induk dengan ID '${dto.unitId}' tidak ditemukan`);
    }

    const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
    const existing = await this.db.query.clinicRooms.findFirst({
      where: eq(clinicRooms.code, normalizedCode),
    });
    if (existing) {
      throw new ConflictException(`Ruangan dengan kode '${normalizedCode}' sudah digunakan`);
    }

    const [created] = await this.db
      .insert(clinicRooms)
      .values({
        unitId: dto.unitId,
        code: normalizedCode,
        name: dto.name.trim(),
        location: dto.location?.trim() || null,
        floor: dto.floor?.trim() || null,
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateRoom(id: string, dto: UpdateFacilityRoomDto): Promise<any> {
    const existing = await this.db.query.clinicRooms.findFirst({
      where: eq(clinicRooms.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Ruangan dengan ID '${id}' tidak ditemukan`);
    }

    if (dto.unitId) {
      const unit = await this.db.query.clinicUnits.findFirst({
        where: eq(clinicUnits.id, dto.unitId),
      });
      if (!unit) {
        throw new NotFoundException(`Unit induk dengan ID '${dto.unitId}' tidak ditemukan`);
      }
    }

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.unitId !== undefined) updates.unitId = dto.unitId;
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.query.clinicRooms.findFirst({
          where: eq(clinicRooms.code, normalizedCode),
        });
        if (duplicate) {
          throw new ConflictException(`Ruangan dengan kode '${normalizedCode}' sudah digunakan`);
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.location !== undefined) updates.location = dto.location?.trim() || null;
    if (dto.floor !== undefined) updates.floor = dto.floor?.trim() || null;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    const [updated] = await this.db
      .update(clinicRooms)
      .set(updates)
      .where(eq(clinicRooms.id, id))
      .returning();

    await this.invalidateCache();
    return updated;
  }

  async deleteRoom(id: string): Promise<void> {
    const existing = await this.db.query.clinicRooms.findFirst({
      where: eq(clinicRooms.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Ruangan dengan ID '${id}' tidak ditemukan`);
    }

    await this.db
      .update(clinicRooms)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(clinicRooms.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 3. SERVICE CATEGORIES
  // ==========================================

  async getCategories(unitId?: string): Promise<any[]> {
    const whereCondition = unitId ? eq(serviceCategories.unitId, unitId) : undefined;
    const categories = await this.db.query.serviceCategories.findMany({
      where: whereCondition,
      orderBy: [asc(serviceCategories.displayOrder), asc(serviceCategories.name)],
      with: {
        clinicUnit: true,
        clinicServices: true,
      },
    });

    return categories.map((c) => ({
      id: c.id,
      unitId: c.unitId,
      unitName: c.clinicUnit?.name || null,
      code: c.code,
      name: c.name,
      codePrefix: c.codePrefix,
      iconName: c.iconName,
      description: c.description,
      displayOrder: c.displayOrder,
      isActive: c.isActive,
      serviceCount: c.clinicServices?.length || 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async createCategory(dto: CreateServiceCategoryDto): Promise<any> {
    if (dto.unitId) {
      const unit = await this.db.query.clinicUnits.findFirst({
        where: eq(clinicUnits.id, dto.unitId),
      });
      if (!unit) {
        throw new NotFoundException(`Unit dengan ID '${dto.unitId}' tidak ditemukan`);
      }
    }

    const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
    const existing = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.code, normalizedCode),
    });
    if (existing) {
      throw new ConflictException(`Kategori dengan kode '${normalizedCode}' sudah digunakan`);
    }

    const [created] = await this.db
      .insert(serviceCategories)
      .values({
        unitId: dto.unitId || null,
        code: normalizedCode,
        name: dto.name.trim(),
        codePrefix: dto.codePrefix?.trim() || null,
        iconName: dto.iconName?.trim() || 'folder',
        description: dto.description?.trim() || null,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateCategory(id: string, dto: UpdateServiceCategoryDto): Promise<any> {
    const existing = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Kategori dengan ID '${id}' tidak ditemukan`);
    }

    if (dto.unitId) {
      const unit = await this.db.query.clinicUnits.findFirst({
        where: eq(clinicUnits.id, dto.unitId),
      });
      if (!unit) {
        throw new NotFoundException(`Unit dengan ID '${dto.unitId}' tidak ditemukan`);
      }
    }

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.unitId !== undefined) updates.unitId = dto.unitId || null;
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.query.serviceCategories.findFirst({
          where: eq(serviceCategories.code, normalizedCode),
        });
        if (duplicate) {
          throw new ConflictException(`Kategori dengan kode '${normalizedCode}' sudah digunakan`);
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.codePrefix !== undefined) updates.codePrefix = dto.codePrefix?.trim() || null;
    if (dto.iconName !== undefined) updates.iconName = dto.iconName?.trim() || 'folder';
    if (dto.description !== undefined) updates.description = dto.description?.trim() || null;
    if (dto.displayOrder !== undefined) updates.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    const [updated] = await this.db
      .update(serviceCategories)
      .set(updates)
      .where(eq(serviceCategories.id, id))
      .returning();

    await this.invalidateCache();
    return updated;
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Kategori dengan ID '${id}' tidak ditemukan`);
    }

    await this.db
      .update(serviceCategories)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(serviceCategories.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 4. CLINIC SERVICES
  // ==========================================

  async getServices(categoryId?: string, unitId?: string): Promise<any[]> {
    let whereCondition: any = undefined;

    if (categoryId) {
      whereCondition = eq(clinicServices.serviceCategoryId, categoryId);
    } else if (unitId) {
      const unitCategories = await this.db.query.serviceCategories.findMany({
        where: eq(serviceCategories.unitId, unitId),
      });
      const catIds = unitCategories.map((c) => c.id);
      if (catIds.length === 0) return [];
      whereCondition = inArray(clinicServices.serviceCategoryId, catIds);
    }

    const services = await this.db.query.clinicServices.findMany({
      where: whereCondition,
      orderBy: [asc(clinicServices.displayOrder), asc(clinicServices.name)],
      with: {
        serviceCategory: {
          with: {
            clinicUnit: true,
          },
        },
        intakeForm: true,
        clinicServiceComplaints: {
          orderBy: [asc(clinicServiceComplaints.displayOrder)],
        },
      },
    });

    return services.map((s) => ({
      id: s.id,
      serviceCategoryId: s.serviceCategoryId,
      categoryName: s.serviceCategory?.name || null,
      unitId: s.serviceCategory?.unitId || null,
      unitName: s.serviceCategory?.clinicUnit?.name || null,
      specialtyId: s.specialtyId,
      intakeFormId: s.intakeFormId || null,
      intakeFormCode: s.intakeForm?.code || null,
      intakeFormName: s.intakeForm?.name || null,
      hasIntakeForm: Boolean(s.intakeFormId),
      code: s.code,
      name: s.name,
      shortName: s.shortName,
      description: s.description,
      codePrefix: s.codePrefix,
      iconName: s.iconName,
      displayOrder: s.displayOrder,
      isBookable: s.isBookable,
      isActive: s.isActive,
      complaints: (s.clinicServiceComplaints || []).map((c) => c.complaintText),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async createService(dto: CreateClinicServiceDto): Promise<any> {
    const category = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.id, dto.serviceCategoryId),
    });
    if (!category) {
      throw new NotFoundException(`Kategori layanan dengan ID '${dto.serviceCategoryId}' tidak ditemukan`);
    }

    if (dto.intakeFormId) {
      const form = await this.db.query.clinicalIntakeForms.findFirst({
        where: eq(clinicalIntakeForms.id, dto.intakeFormId),
      });
      if (!form) {
        throw new NotFoundException(`Formulir intake dengan ID '${dto.intakeFormId}' tidak ditemukan`);
      }
    }

    const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
    const existing = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.code, normalizedCode),
    });
    if (existing) {
      throw new ConflictException(`Layanan dengan kode '${normalizedCode}' sudah digunakan`);
    }

    return await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(clinicServices)
        .values({
          serviceCategoryId: dto.serviceCategoryId,
          specialtyId: dto.specialtyId || null,
          intakeFormId: dto.intakeFormId || null,
          code: normalizedCode,
          name: dto.name.trim(),
          shortName: dto.shortName?.trim() || null,
          description: dto.description?.trim() || null,
          codePrefix: dto.codePrefix.trim().toUpperCase(),
          iconName: dto.iconName?.trim() || 'stethoscope',
          displayOrder: dto.displayOrder ?? 0,
          isBookable: dto.isBookable ?? true,
          isActive: dto.isActive ?? true,
        })
        .returning();

      if (dto.complaints && dto.complaints.length > 0) {
        await tx.insert(clinicServiceComplaints).values(
          dto.complaints.map((c, idx) => ({
            serviceId: created.id,
            complaintText: c.trim(),
            displayOrder: idx + 1,
          })),
        );
      }

      await this.invalidateCache();
      return created;
    });
  }

  async updateService(id: string, dto: UpdateClinicServiceDto): Promise<any> {
    const existing = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Layanan dengan ID '${id}' tidak ditemukan`);
    }

    if (dto.serviceCategoryId) {
      const category = await this.db.query.serviceCategories.findFirst({
        where: eq(serviceCategories.id, dto.serviceCategoryId),
      });
      if (!category) {
        throw new NotFoundException(`Kategori layanan dengan ID '${dto.serviceCategoryId}' tidak ditemukan`);
      }
    }

    if (dto.intakeFormId !== undefined) {
      if (dto.intakeFormId) {
        const form = await this.db.query.clinicalIntakeForms.findFirst({
          where: eq(clinicalIntakeForms.id, dto.intakeFormId),
        });
        if (!form) {
          throw new NotFoundException(`Formulir intake dengan ID '${dto.intakeFormId}' tidak ditemukan`);
        }
      }
    }

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.serviceCategoryId !== undefined) updates.serviceCategoryId = dto.serviceCategoryId;
    if (dto.specialtyId !== undefined) updates.specialtyId = dto.specialtyId || null;
    if (dto.intakeFormId !== undefined) updates.intakeFormId = dto.intakeFormId || null;
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.query.clinicServices.findFirst({
          where: eq(clinicServices.code, normalizedCode),
        });
        if (duplicate) {
          throw new ConflictException(`Layanan dengan kode '${normalizedCode}' sudah digunakan`);
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.shortName !== undefined) updates.shortName = dto.shortName?.trim() || null;
    if (dto.description !== undefined) updates.description = dto.description?.trim() || null;
    if (dto.codePrefix !== undefined) updates.codePrefix = dto.codePrefix.trim().toUpperCase();
    if (dto.iconName !== undefined) updates.iconName = dto.iconName?.trim() || 'stethoscope';
    if (dto.displayOrder !== undefined) updates.displayOrder = dto.displayOrder;
    if (dto.isBookable !== undefined) updates.isBookable = dto.isBookable;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    return await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(clinicServices)
        .set(updates)
        .where(eq(clinicServices.id, id))
        .returning();

      if (dto.complaints !== undefined) {
        await tx
          .delete(clinicServiceComplaints)
          .where(eq(clinicServiceComplaints.serviceId, id));

        if (dto.complaints.length > 0) {
          await tx.insert(clinicServiceComplaints).values(
            dto.complaints.map((c, idx) => ({
              serviceId: id,
              complaintText: c.trim(),
              displayOrder: idx + 1,
            })),
          );
        }
      }

      await this.invalidateCache();
      return updated;
    });
  }

  async deleteService(id: string): Promise<void> {
    const existing = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Layanan dengan ID '${id}' tidak ditemukan`);
    }

    await this.db
      .update(clinicServices)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(clinicServices.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 5. CLINICAL INTAKE FORMS (Dynamic Registry)
  // ==========================================

  async getForms(): Promise<any[]> {
    const forms = await this.db.query.clinicalIntakeForms.findMany({
      orderBy: [asc(clinicalIntakeForms.name)],
      with: {
        clinicServices: true,
      },
    });

    return forms.map((f) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      description: f.description,
      iconName: f.iconName,
      isActive: f.isActive,
      serviceCount: f.clinicServices?.length || 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  async createForm(dto: CreateClinicalIntakeFormDto): Promise<any> {
    const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
    const existing = await this.db.query.clinicalIntakeForms.findFirst({
      where: eq(clinicalIntakeForms.code, normalizedCode),
    });
    if (existing) {
      throw new ConflictException(`Formulir dengan kode '${normalizedCode}' sudah digunakan`);
    }

    const [created] = await this.db
      .insert(clinicalIntakeForms)
      .values({
        code: normalizedCode,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        iconName: dto.iconName?.trim() || 'clipboard-list',
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateForm(id: string, dto: UpdateClinicalIntakeFormDto): Promise<any> {
    const existing = await this.db.query.clinicalIntakeForms.findFirst({
      where: eq(clinicalIntakeForms.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Formulir dengan ID '${id}' tidak ditemukan`);
    }

    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.query.clinicalIntakeForms.findFirst({
          where: eq(clinicalIntakeForms.code, normalizedCode),
        });
        if (duplicate) {
          throw new ConflictException(`Formulir dengan kode '${normalizedCode}' sudah digunakan`);
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.description !== undefined) updates.description = dto.description?.trim() || null;
    if (dto.iconName !== undefined) updates.iconName = dto.iconName?.trim() || 'clipboard-list';
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    const [updated] = await this.db
      .update(clinicalIntakeForms)
      .set(updates)
      .where(eq(clinicalIntakeForms.id, id))
      .returning();

    await this.invalidateCache();
    return updated;
  }

  async deleteForm(id: string): Promise<void> {
    const existing = await this.db.query.clinicalIntakeForms.findFirst({
      where: eq(clinicalIntakeForms.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Formulir dengan ID '${id}' tidak ditemukan`);
    }

    await this.db
      .update(clinicalIntakeForms)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(clinicalIntakeForms.id, id));

    await this.invalidateCache();
  }
}

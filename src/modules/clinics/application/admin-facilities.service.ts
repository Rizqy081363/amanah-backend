import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { CanonicalSlugHelper } from '@common/utils';
import { RedisService } from '../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicalEncounters,
  clinicalIntakeForms,
  clinicRooms,
  clinicServiceCategoryMappings,
  clinicServiceComplaints,
  clinicServices,
  clinicUnitCategoryMappings,
  clinicUnits,
  clinicUnitTypes,
  patientAffiliations,
  patientRelationshipTypes,
  practitioners,
  queueTickets,
  serviceCategories,
  staffProfiles,
} from '../../../database/schema';
import {
  CreateClinicalIntakeFormDto,
  CreateClinicServiceDto,
  CreateFacilityRoomDto,
  CreateFacilityUnitDto,
  CreateFacilityUnitTypeDto,
  CreateServiceCategoryDto,
  LinkCategoriesToUnitDto,
  UpdateClinicalIntakeFormDto,
  UpdateClinicServiceDto,
  UpdateFacilityRoomDto,
  UpdateFacilityUnitDto,
  UpdateFacilityUnitTypeDto,
  UpdateServiceCategoryDto,
} from '../presentation/dto/admin-facilities.dto';
import type { BulkFacilityActionInput } from '../presentation/schemas/facility-bulk.schema';
import type {
  CreateFacilityRelationshipInput,
  UpdateFacilityRelationshipInput,
} from '../presentation/schemas/facility-relationship.schema';

export interface AdminRelationshipResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  iconName: string;
  displayOrder: number;
  isActive: boolean;
  isSystem: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminServiceCategoryResponse {
  id: string;
  unitId: string | null;
  unitName: string | null;
  unitIds: string[];
  units: Array<{ id: string; name: string }>;
  code: string;
  name: string;
  codePrefix: string | null;
  iconName: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  serviceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminClinicServiceResponse {
  id: string;
  serviceCategoryId: string | null;
  categoryIds: string[];
  categories: Array<{
    id: string;
    name: string;
    code: string;
    unitId: string | null;
    unitName: string | null;
    isPrimary: boolean;
  }>;
  categoryName: string | null;
  unitId: string | null;
  unitName: string | null;
  specialtyId: string | null;
  intakeFormId: string | null;
  intakeFormCode: string | null;
  intakeFormName: string | null;
  name: string;
  code: string;
  shortName: string | null;
  description: string | null;
  codePrefix: string;
  iconName: string | null;
  displayOrder: number;
  isBookable: boolean;
  isActive: boolean;
  complaints: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUnitResponse {
  id: string;
  code: string;
  name: string;
  unitTypeId: string;
  unitType: {
    id: string;
    code: string;
    name: string;
    iconName: string;
  } | null;
  unitTypeName: string | null;
  queuePrefix: string | null;
  iconName: string;
  location: string | null;
  floor: string | null;
  isActive: boolean;
  roomCount: number;
  categoryCount: number;
  categoryIds: string[];
  categories: Array<{
    id: string;
    name: string;
    code: string;
    iconName: string;
    isPrimary: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUnitTypeResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  iconName: string;
  isActive: boolean;
  unitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRoomResponse {
  id: string;
  unitId: string | null;
  unitName: string | null;
  code: string;
  name: string;
  location: string | null;
  floor: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFormResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  iconName: string;
  isActive: boolean;
  serviceCount: number;
  createdAt: string;
  updatedAt: string;
}

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
        this.redisService.deleteByPrefix('facilities'),
        this.redisService.deleteByPrefix('appointments'),
        this.redisService.deleteByPrefix('doctor-schedules'),
        this.redisService.deleteByPrefix('queue'),
        this.redisService.deleteByPrefix('httpcache'),
        this.redisService.invalidateTags('clinics', 'catalog', 'schedule'),
      ]);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate clinic facilities cache: ${String(err)}`,
      );
    }
  }

  /**
   * Resolves a canonical, collision-free code for clinical facilities.
   * If explicit code is provided, verifies uniqueness or throws ConflictException.
   * If omitted, automatically generates a safe snake_case slug from name and disambiguates duplicates (_2, _3).
   */
  private async resolveUniqueCode(
    preferredCode: string | undefined,
    name: string,
    fallbackPrefix: string,
    existsFn: (candidate: string) => Promise<boolean>,
  ): Promise<string> {
    if (preferredCode && preferredCode.trim()) {
      const explicitCode = CanonicalSlugHelper.toSnakeCase(preferredCode, fallbackPrefix);
      const exists = await existsFn(explicitCode);
      if (exists) {
        throw new ConflictException(`Kode '${explicitCode}' sudah digunakan`);
      }
      return explicitCode;
    }

    const baseCode = CanonicalSlugHelper.toSnakeCase(name, fallbackPrefix);
    let candidate = baseCode;
    let counter = 1;
    while (await existsFn(candidate)) {
      counter++;
      candidate = `${baseCode}_${counter}`;
    }
    return candidate;
  }

  // ==========================================
  // 0. CLINIC UNIT TYPES (Master Tipe Unit)
  // ==========================================

  async getUnitTypes(): Promise<AdminUnitTypeResponse[]> {
    const types = await this.db.query.clinicUnitTypes.findMany({
      orderBy: [asc(clinicUnitTypes.name)],
      with: {
        clinicUnits: true,
      },
    });

    return types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      iconName: t.iconName,
      isActive: t.isActive,
      unitCount: t.clinicUnits?.length || 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async createUnitType(
    dto: CreateFacilityUnitTypeDto,
  ): Promise<typeof clinicUnitTypes.$inferSelect> {
    const finalCode = await this.resolveUniqueCode(
      dto.code,
      dto.name,
      'unit_type',
      async (code) => {
        const found = await this.db.query.clinicUnitTypes.findFirst({
          where: eq(clinicUnitTypes.code, code),
        });
        return Boolean(found);
      },
    );

    const [created] = await this.db
      .insert(clinicUnitTypes)
      .values({
        code: finalCode,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        iconName: dto.iconName?.trim() || 'building-2',
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateUnitType(
    id: string,
    dto: UpdateFacilityUnitTypeDto,
  ): Promise<typeof clinicUnitTypes.$inferSelect> {
    const existing = await this.db.query.clinicUnitTypes.findFirst({
      where: eq(clinicUnitTypes.id, id),
    });
    if (!existing) {
      throw new NotFoundException(
        `Tipe unit dengan ID '${id}' tidak ditemukan`,
      );
    }

    const updates: Partial<typeof clinicUnitTypes.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.query.clinicUnitTypes.findFirst({
          where: eq(clinicUnitTypes.code, normalizedCode),
        });
        if (duplicate) {
          throw new ConflictException(
            `Tipe unit dengan kode '${normalizedCode}' sudah digunakan`,
          );
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.description !== undefined)
      updates.description = dto.description?.trim() || null;
    if (dto.iconName !== undefined)
      updates.iconName = dto.iconName?.trim() || 'building-2';
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    const [updated] = await this.db
      .update(clinicUnitTypes)
      .set(updates)
      .where(eq(clinicUnitTypes.id, id))
      .returning();

    await this.invalidateCache();
    return updated;
  }

  async deleteUnitType(id: string): Promise<void> {
    const existing = await this.db.query.clinicUnitTypes.findFirst({
      where: eq(clinicUnitTypes.id, id),
    });
    if (!existing) {
      throw new NotFoundException(
        `Tipe unit dengan ID '${id}' tidak ditemukan`,
      );
    }

    // Verify referential integrity with child clinic units
    const linkedUnits = await this.db.query.clinicUnits.findMany({
      where: eq(clinicUnits.unitTypeId, id),
    });
    if (linkedUnits.length > 0) {
      throw new ConflictException(
        `Ups! Klasifikasi ini tidak dapat dihapus karena masih digunakan oleh ${linkedUnits.length} poliklinik/departemen. Pindahkan atau hapus poliklinik terkait terlebih dahulu.`,
      );
    }

    await this.db
      .delete(clinicUnitTypes)
      .where(eq(clinicUnitTypes.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 1. CLINIC UNITS
  // ==========================================

  async getUnits(
    search?: string,
    status?: string,
  ): Promise<AdminUnitResponse[]> {
    const conditions: Array<SQL | undefined> = [];
    if (status === 'active') conditions.push(eq(clinicUnits.isActive, true));
    if (status === 'inactive') conditions.push(eq(clinicUnits.isActive, false));
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(clinicUnits.name, term), ilike(clinicUnits.code, term)));
    }
    const validConditions = conditions.filter((c): c is SQL => Boolean(c));
    const whereCondition = validConditions.length > 0 ? and(...validConditions) : undefined;

    const units = await this.db.query.clinicUnits.findMany({
      where: whereCondition,
      orderBy: [asc(clinicUnits.name)],
      with: {
        clinicRooms: true,
        serviceCategories: true,
        categoryMappings: {
          with: {
            category: true,
          },
        },
        clinicUnitType: true,
      },
    });

    return units.map((u) => {
      const categoriesMap = new Map<
        string,
        {
          id: string;
          name: string;
          code: string;
          iconName: string;
          isPrimary: boolean;
        }
      >();

      for (const cat of u.serviceCategories || []) {
        if (!categoriesMap.has(cat.id)) {
          categoriesMap.set(cat.id, {
            id: cat.id,
            name: cat.name,
            code: cat.code,
            iconName: cat.iconName || 'folder',
            isPrimary: true,
          });
        }
      }

      for (const mapping of u.categoryMappings || []) {
        if (mapping.category && !categoriesMap.has(mapping.categoryId)) {
          categoriesMap.set(mapping.categoryId, {
            id: mapping.category.id,
            name: mapping.category.name,
            code: mapping.category.code,
            iconName: mapping.category.iconName || 'folder',
            isPrimary: Boolean(mapping.isPrimary),
          });
        }
      }

      const categories = Array.from(categoriesMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const categoryIds = Array.from(categoriesMap.keys());

      return {
        id: u.id,
        code: u.code,
        name: u.name,
        unitTypeId: u.unitTypeId,
        unitType: u.clinicUnitType
          ? {
              id: u.clinicUnitType.id,
              code: u.clinicUnitType.code,
              name: u.clinicUnitType.name,
              iconName: u.clinicUnitType.iconName,
            }
          : null,
        unitTypeName: u.clinicUnitType?.name || null,
        queuePrefix: u.queuePrefix,
        iconName: u.iconName,
        location: u.location,
        floor: u.floor,
        isActive: u.isActive,
        roomCount: u.clinicRooms?.length || 0,
        categoryCount: categoriesMap.size,
        categoryIds,
        categories,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      };
    });
  }

  async createUnit(
    dto: CreateFacilityUnitDto,
  ): Promise<typeof clinicUnits.$inferSelect> {
    const unitType = await this.db.query.clinicUnitTypes.findFirst({
      where: eq(clinicUnitTypes.id, dto.unitTypeId),
    });
    if (!unitType) {
      throw new NotFoundException(
        `Tipe unit dengan ID '${dto.unitTypeId}' tidak ditemukan`,
      );
    }

    const finalCode = await this.resolveUniqueCode(
      dto.code,
      dto.name,
      'unit',
      async (code) => {
        const found = await this.db.query.clinicUnits.findFirst({
          where: eq(clinicUnits.code, code),
        });
        return Boolean(found);
      },
    );

    const finalPrefix =
      dto.queuePrefix?.trim() || CanonicalSlugHelper.toPrefix(dto.name, 4);

    const [created] = await this.db
      .insert(clinicUnits)
      .values({
        code: finalCode,
        name: dto.name.trim(),
        unitTypeId: dto.unitTypeId,
        queuePrefix: finalPrefix || null,
        iconName: dto.iconName?.trim() || 'building-2',
        location: dto.location?.trim() || null,
        floor: dto.floor?.trim() || null,
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateUnit(
    id: string,
    dto: UpdateFacilityUnitDto,
  ): Promise<typeof clinicUnits.$inferSelect> {
    const existing = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Unit dengan ID '${id}' tidak ditemukan`);
    }

    if (dto.unitTypeId !== undefined) {
      const unitType = await this.db.query.clinicUnitTypes.findFirst({
        where: eq(clinicUnitTypes.id, dto.unitTypeId),
      });
      if (!unitType) {
        throw new NotFoundException(
          `Tipe unit dengan ID '${dto.unitTypeId}' tidak ditemukan`,
        );
      }
    }

    const updates: Partial<typeof clinicUnits.$inferInsert> = {
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
          throw new ConflictException(
            `Unit dengan kode '${normalizedCode}' sudah digunakan`,
          );
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.unitTypeId !== undefined) updates.unitTypeId = dto.unitTypeId;
    if (dto.queuePrefix !== undefined) {
      updates.queuePrefix =
        dto.queuePrefix?.trim() ||
        CanonicalSlugHelper.toPrefix(updates.name || existing.name, 4);
    } else if (!existing.queuePrefix && updates.name) {
      updates.queuePrefix = CanonicalSlugHelper.toPrefix(updates.name, 4);
    }
    if (dto.iconName !== undefined)
      updates.iconName = dto.iconName?.trim() || 'building-2';
    if (dto.location !== undefined)
      updates.location = dto.location?.trim() || null;
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

    // Verify referential integrity with child rooms, categories, and assigned staff
    const [linkedRooms, linkedCats, linkedStaff] = await Promise.all([
      this.db.query.clinicRooms.findMany({ where: eq(clinicRooms.unitId, id) }),
      this.db.query.serviceCategories.findMany({
        where: eq(serviceCategories.unitId, id),
      }),
      this.db.query.staffProfiles.findMany({
        where: eq(staffProfiles.primaryUnitId, id),
      }),
    ]);

    if (
      linkedRooms.length > 0 ||
      linkedCats.length > 0 ||
      linkedStaff.length > 0
    ) {
      const reasons: string[] = [];
      if (linkedRooms.length > 0)
        reasons.push(`${linkedRooms.length} ruang periksa`);
      if (linkedCats.length > 0)
        reasons.push(`${linkedCats.length} kelompok layanan`);
      if (linkedStaff.length > 0)
        reasons.push(`${linkedStaff.length} staf terkait`);
      throw new ConflictException(
        `Ups! Poliklinik ini tidak dapat dihapus karena masih terhubung dengan ${reasons.join(', ')}. Lepaskan keterkaitan terlebih dahulu.`,
      );
    }

    await this.db.delete(clinicUnits).where(eq(clinicUnits.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 2. CLINIC ROOMS
  // ==========================================

  async getRooms(
    unitId?: string,
    search?: string,
    status?: string,
  ): Promise<AdminRoomResponse[]> {
    const conditions: Array<SQL | undefined> = [];
    if (unitId) conditions.push(eq(clinicRooms.unitId, unitId));
    if (status === 'active') conditions.push(eq(clinicRooms.isActive, true));
    if (status === 'inactive') conditions.push(eq(clinicRooms.isActive, false));
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(clinicRooms.name, term), ilike(clinicRooms.code, term)));
    }
    const validConditions = conditions.filter((c): c is SQL => Boolean(c));
    const whereCondition =
      validConditions.length > 0 ? and(...validConditions) : undefined;

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

  async createRoom(
    dto: CreateFacilityRoomDto,
  ): Promise<typeof clinicRooms.$inferSelect> {
    const unit = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, dto.unitId),
    });
    if (!unit) {
      throw new NotFoundException(
        `Unit induk dengan ID '${dto.unitId}' tidak ditemukan`,
      );
    }

    const finalCode = await this.resolveUniqueCode(
      dto.code,
      dto.name,
      'room',
      async (code) => {
        const found = await this.db.query.clinicRooms.findFirst({
          where: eq(clinicRooms.code, code),
        });
        return Boolean(found);
      },
    );

    const [created] = await this.db
      .insert(clinicRooms)
      .values({
        unitId: dto.unitId,
        code: finalCode,
        name: dto.name.trim(),
        location: dto.location?.trim() || null,
        floor: dto.floor?.trim() || null,
        isActive: dto.isActive ?? true,
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateRoom(
    id: string,
    dto: UpdateFacilityRoomDto,
  ): Promise<typeof clinicRooms.$inferSelect> {
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
        throw new NotFoundException(
          `Unit induk dengan ID '${dto.unitId}' tidak ditemukan`,
        );
      }
    }

    const updates: Partial<typeof clinicRooms.$inferInsert> = {
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
          throw new ConflictException(
            `Ruangan dengan kode '${normalizedCode}' sudah digunakan`,
          );
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.location !== undefined)
      updates.location = dto.location?.trim() || null;
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

    // Verify referential integrity with appointments, queue tickets, and doctor assignment
    const [linkedAppointments, linkedTickets, linkedDoctors] =
      await Promise.all([
        this.db.query.appointments.findMany({
          where: eq(appointments.roomId, id),
        }),
        this.db.query.queueTickets.findMany({
          where: eq(queueTickets.roomId, id),
        }),
        this.db.query.practitioners.findMany({
          where: eq(practitioners.defaultRoomId, id),
        }),
      ]);

    if (
      linkedAppointments.length > 0 ||
      linkedTickets.length > 0 ||
      linkedDoctors.length > 0
    ) {
      throw new ConflictException(
        'Ups! Ruang periksa ini tidak dapat dihapus karena memiliki riwayat janji temu atau penugasan dokter.',
      );
    }

    await this.db.delete(clinicRooms).where(eq(clinicRooms.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 3. SERVICE CATEGORIES
  // ==========================================

  async getCategories(
    unitId?: string,
    search?: string,
    status?: string,
  ): Promise<AdminServiceCategoryResponse[]> {
    const conditions: Array<SQL | undefined> = [];
    if (unitId) {
      const mappings = await this.db.query.clinicUnitCategoryMappings.findMany({
        where: eq(clinicUnitCategoryMappings.unitId, unitId),
      });
      const mappedCatIds = mappings.map((m) => m.categoryId);
      conditions.push(
        or(
          eq(serviceCategories.unitId, unitId),
          mappedCatIds.length > 0
            ? inArray(serviceCategories.id, mappedCatIds)
            : sql`false`,
        ),
      );
    }
    if (status === 'active') conditions.push(eq(serviceCategories.isActive, true));
    if (status === 'inactive') conditions.push(eq(serviceCategories.isActive, false));
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(serviceCategories.name, term),
          ilike(serviceCategories.code, term),
        ),
      );
    }
    const validConditions = conditions.filter((c): c is SQL => Boolean(c));
    const whereCondition =
      validConditions.length > 0 ? and(...validConditions) : undefined;
    const categories = await this.db.query.serviceCategories.findMany({
      where: whereCondition,
      orderBy: [
        asc(serviceCategories.displayOrder),
        asc(serviceCategories.name),
      ],
      with: {
        clinicUnit: true,
        clinicServices: true,
        serviceMappings: true,
        unitMappings: {
          with: {
            unit: true,
          },
        },
      },
    });

    return categories.map((c) => {
      const directServices = c.clinicServices || [];
      const mappedServiceIds = (c.serviceMappings || []).map((m) => m.serviceId);
      const allServiceIds = new Set([
        ...directServices.map((s) => s.id),
        ...mappedServiceIds,
      ]);

      const directUnit = c.clinicUnit ? [c.clinicUnit] : [];
      const mappedUnits = (c.unitMappings || [])
        .map((m) => m.unit)
        .filter((u): u is NonNullable<typeof c.clinicUnit> => Boolean(u));
      const unitsMap = new Map<string, { id: string; name: string }>();
      for (const u of [...directUnit, ...mappedUnits]) {
        if (u?.id && !unitsMap.has(u.id)) {
          unitsMap.set(u.id, { id: u.id, name: u.name });
        }
      }
      const unitsList = Array.from(unitsMap.values());
      const unitIds = unitsList.map((u) => u.id);

      return {
        id: c.id,
        unitId: c.unitId,
        unitName: c.clinicUnit?.name || (unitsList.length > 0 ? unitsList[0].name : null),
        unitIds,
        units: unitsList,
        code: c.code,
        name: c.name,
        codePrefix: c.codePrefix,
        iconName: c.iconName,
        description: c.description,
        displayOrder: c.displayOrder,
        isActive: c.isActive,
        serviceCount: allServiceIds.size,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }

  async createCategory(
    dto: CreateServiceCategoryDto,
  ): Promise<typeof serviceCategories.$inferSelect> {
    const rawUnitIds = dto.unitIds?.filter((id): id is string => Boolean(id)) || [];
    const primaryUnitId = dto.unitId ?? (rawUnitIds.length > 0 ? rawUnitIds[0] : null);
    const allUnitIds = Array.from(
      new Set([primaryUnitId, ...rawUnitIds].filter((id): id is string => Boolean(id))),
    );

    if (allUnitIds.length > 0) {
      const validUnits = await this.db.query.clinicUnits.findMany({
        where: inArray(clinicUnits.id, allUnitIds),
      });
      if (validUnits.length !== allUnitIds.length) {
        throw new NotFoundException('Satu atau lebih unit poliklinik tidak ditemukan');
      }
    }

    const finalCode = await this.resolveUniqueCode(
      dto.code,
      dto.name,
      'category',
      async (code) => {
        const found = await this.db.query.serviceCategories.findFirst({
          where: eq(serviceCategories.code, code),
        });
        return Boolean(found);
      },
    );

    const finalPrefix =
      dto.codePrefix?.trim() || CanonicalSlugHelper.toPrefix(dto.name, 4);

    return await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(serviceCategories)
        .values({
          unitId: primaryUnitId,
          code: finalCode,
          name: dto.name.trim(),
          codePrefix: finalPrefix || null,
          iconName: dto.iconName?.trim() || 'folder',
          description: dto.description?.trim() || null,
          displayOrder: dto.displayOrder ?? 0,
          isActive: dto.isActive ?? true,
        })
        .returning();

      if (allUnitIds.length > 0) {
        await tx.insert(clinicUnitCategoryMappings).values(
          allUnitIds.map((uId) => ({
            unitId: uId,
            categoryId: created.id,
            isPrimary: uId === primaryUnitId,
          })),
        );
      }

      await this.invalidateCache();
      return created;
    });
  }

  async updateCategory(
    id: string,
    dto: UpdateServiceCategoryDto,
  ): Promise<typeof serviceCategories.$inferSelect> {
    const existing = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Kategori dengan ID '${id}' tidak ditemukan`);
    }

    let allUnitIds: string[] | undefined;
    let primaryUnitId: string | null | undefined;
    if (dto.unitIds !== undefined) {
      const rawUnitIds = dto.unitIds.filter((id): id is string => Boolean(id));
      primaryUnitId =
        dto.unitId !== undefined
          ? (dto.unitId ?? null)
          : (rawUnitIds.length > 0 ? rawUnitIds[0] : null);
      allUnitIds = Array.from(
        new Set([primaryUnitId, ...rawUnitIds].filter((id): id is string => Boolean(id))),
      );
    } else if (dto.unitId !== undefined) {
      primaryUnitId = dto.unitId ?? null;
      allUnitIds = primaryUnitId ? [primaryUnitId] : [];
    }

    if (allUnitIds && allUnitIds.length > 0) {
      const validUnits = await this.db.query.clinicUnits.findMany({
        where: inArray(clinicUnits.id, allUnitIds),
      });
      if (validUnits.length !== allUnitIds.length) {
        throw new NotFoundException('Satu atau lebih unit poliklinik tidak ditemukan');
      }
    }

    const updates: Partial<typeof serviceCategories.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (primaryUnitId !== undefined) updates.unitId = primaryUnitId;
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.query.serviceCategories.findFirst({
          where: eq(serviceCategories.code, normalizedCode),
        });
        if (duplicate) {
          throw new ConflictException(
            `Kategori dengan kode '${normalizedCode}' sudah digunakan`,
          );
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.codePrefix !== undefined)
      updates.codePrefix = dto.codePrefix?.trim() || null;
    if (dto.iconName !== undefined)
      updates.iconName = dto.iconName?.trim() || 'folder';
    if (dto.description !== undefined)
      updates.description = dto.description?.trim() || null;
    if (dto.displayOrder !== undefined) updates.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    return await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(serviceCategories)
        .set(updates)
        .where(eq(serviceCategories.id, id))
        .returning();

      if (allUnitIds !== undefined) {
        await tx
          .delete(clinicUnitCategoryMappings)
          .where(eq(clinicUnitCategoryMappings.categoryId, id));

        if (allUnitIds.length > 0) {
          await tx.insert(clinicUnitCategoryMappings).values(
            allUnitIds.map((uId) => ({
              unitId: uId,
              categoryId: id,
              isPrimary: uId === primaryUnitId,
            })),
          );
        }
      }

      await this.invalidateCache();
      return updated;
    });
  }

  async linkServicesToCategory(
    categoryId: string,
    serviceIds: string[],
  ): Promise<{ linked: number }> {
    const category = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.id, categoryId),
    });
    if (!category) {
      throw new NotFoundException(
        `Kategori dengan ID '${categoryId}' tidak ditemukan`,
      );
    }

    if (!serviceIds || serviceIds.length === 0) {
      return { linked: 0 };
    }

    let linkedCount = 0;
    for (const serviceId of serviceIds) {
      const existing =
        await this.db.query.clinicServiceCategoryMappings.findFirst({
          where: and(
            eq(clinicServiceCategoryMappings.categoryId, categoryId),
            eq(clinicServiceCategoryMappings.serviceId, serviceId),
          ),
        });
      if (!existing) {
        await this.db.insert(clinicServiceCategoryMappings).values({
          categoryId,
          serviceId,
          isPrimary: false,
        });
        linkedCount++;
      }
    }

    await this.invalidateCache();
    return { linked: linkedCount };
  }

  async unlinkServiceFromCategory(
    categoryId: string,
    serviceId: string,
  ): Promise<{ unlinked: boolean }> {
    const category = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.id, categoryId),
    });
    if (!category) {
      throw new NotFoundException(
        `Kategori dengan ID '${categoryId}' tidak ditemukan`,
      );
    }

    await this.db
      .delete(clinicServiceCategoryMappings)
      .where(
        and(
          eq(clinicServiceCategoryMappings.categoryId, categoryId),
          eq(clinicServiceCategoryMappings.serviceId, serviceId),
        ),
      );

    const service = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.id, serviceId),
      with: {
        categoryMappings: true,
      },
    });

    if (service && service.serviceCategoryId === categoryId) {
      const nextCategory = service.categoryMappings?.[0]?.categoryId || null;
      await this.db
        .update(clinicServices)
        .set({ serviceCategoryId: nextCategory })
        .where(eq(clinicServices.id, serviceId));
    }

    await this.invalidateCache();
    return { unlinked: true };
  }

  async linkCategoriesToUnit(
    unitId: string,
    dto: LinkCategoriesToUnitDto,
  ): Promise<{ linked: number }> {
    const unit = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, unitId),
    });
    if (!unit) {
      throw new NotFoundException(
        `Unit poliklinik dengan ID '${unitId}' tidak ditemukan`,
      );
    }

    const uniqueCategoryIds = Array.from(
      new Set(dto.categoryIds.filter((id): id is string => Boolean(id))),
    );
    if (uniqueCategoryIds.length === 0) {
      return { linked: 0 };
    }

    const validCategories = await this.db.query.serviceCategories.findMany({
      where: inArray(serviceCategories.id, uniqueCategoryIds),
    });
    if (validCategories.length !== uniqueCategoryIds.length) {
      throw new NotFoundException(
        'Satu atau lebih kelompok layanan tidak ditemukan',
      );
    }

    const existingMappings =
      await this.db.query.clinicUnitCategoryMappings.findMany({
        where: and(
          eq(clinicUnitCategoryMappings.unitId, unitId),
          inArray(clinicUnitCategoryMappings.categoryId, uniqueCategoryIds),
        ),
      });

    const alreadyMappedCategoryIds = new Set(
      existingMappings.map((m) => m.categoryId),
    );
    const toInsert = uniqueCategoryIds
      .filter((catId) => !alreadyMappedCategoryIds.has(catId))
      .map((categoryId) => {
        const cat = validCategories.find((c) => c.id === categoryId);
        const isPrimary = cat?.unitId === unitId;
        return {
          unitId,
          categoryId,
          isPrimary,
        };
      });

    if (toInsert.length > 0) {
      await this.db.insert(clinicUnitCategoryMappings).values(toInsert);
    }

    await this.invalidateCache();
    return { linked: toInsert.length };
  }

  async unlinkCategoryFromUnit(
    unitId: string,
    categoryId: string,
  ): Promise<{ unlinked: boolean }> {
    const unit = await this.db.query.clinicUnits.findFirst({
      where: eq(clinicUnits.id, unitId),
    });
    if (!unit) {
      throw new NotFoundException(
        `Unit poliklinik dengan ID '${unitId}' tidak ditemukan`,
      );
    }

    const category = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.id, categoryId),
    });
    if (!category) {
      throw new NotFoundException(
        `Kelompok layanan dengan ID '${categoryId}' tidak ditemukan`,
      );
    }

    await this.db
      .delete(clinicUnitCategoryMappings)
      .where(
        and(
          eq(clinicUnitCategoryMappings.unitId, unitId),
          eq(clinicUnitCategoryMappings.categoryId, categoryId),
        ),
      );

    if (category.unitId === unitId) {
      const remainingMapping =
        await this.db.query.clinicUnitCategoryMappings.findFirst({
          where: eq(clinicUnitCategoryMappings.categoryId, categoryId),
        });

      await this.db
        .update(serviceCategories)
        .set({
          unitId: remainingMapping ? remainingMapping.unitId : null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(serviceCategories.id, categoryId));
    }

    await this.invalidateCache();
    return { unlinked: true };
  }

  async deleteCategory(id: string): Promise<void> {
    const existing = await this.db.query.serviceCategories.findFirst({
      where: eq(serviceCategories.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Kategori dengan ID '${id}' tidak ditemukan`);
    }

    // Verify referential integrity with services under this category
    const linkedServices = await this.db.query.clinicServices.findMany({
      where: eq(clinicServices.serviceCategoryId, id),
    });
    if (linkedServices.length > 0) {
      throw new ConflictException(
        `Ups! Kelompok layanan ini tidak dapat dihapus karena masih memuat ${linkedServices.length} service medis. Pindahkan atau hapus service terkait terlebih dahulu.`,
      );
    }

    await this.db
      .delete(serviceCategories)
      .where(eq(serviceCategories.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 4. CLINIC SERVICES
  // ==========================================

  async getServices(
    categoryId?: string,
    unitId?: string,
    search?: string,
    status?: string,
  ): Promise<AdminClinicServiceResponse[]> {
    const conditions: Array<SQL | undefined> = [];

    if (categoryId) {
      const mapped = await this.db.query.clinicServiceCategoryMappings.findMany({
        where: eq(clinicServiceCategoryMappings.categoryId, categoryId),
      });
      const sIds = mapped.map((m) => m.serviceId);
      conditions.push(
        or(
          eq(clinicServices.serviceCategoryId, categoryId),
          sIds.length > 0 ? inArray(clinicServices.id, sIds) : sql`false`,
        ),
      );
    } else if (unitId) {
      const unitCategories = await this.db.query.serviceCategories.findMany({
        where: or(
          eq(serviceCategories.unitId, unitId),
          isNull(serviceCategories.unitId),
        ),
      });
      const catIds = unitCategories.map((c) => c.id);
      if (catIds.length === 0) return [];
      const mapped = await this.db.query.clinicServiceCategoryMappings.findMany({
        where: inArray(clinicServiceCategoryMappings.categoryId, catIds),
      });
      const sIds = mapped.map((m) => m.serviceId);
      conditions.push(
        or(
          inArray(clinicServices.serviceCategoryId, catIds),
          sIds.length > 0 ? inArray(clinicServices.id, sIds) : sql`false`,
        ),
      );
    }

    if (status === 'active') conditions.push(eq(clinicServices.isActive, true));
    if (status === 'inactive') conditions.push(eq(clinicServices.isActive, false));
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(clinicServices.name, term),
          ilike(clinicServices.code, term),
          ilike(clinicServices.shortName, term),
        ),
      );
    }

    const validConditions = conditions.filter((c): c is SQL => Boolean(c));
    const whereCondition =
      validConditions.length > 0 ? and(...validConditions) : undefined;

    const services = await this.db.query.clinicServices.findMany({
      where: whereCondition,
      orderBy: [asc(clinicServices.displayOrder), asc(clinicServices.name)],
      with: {
        serviceCategory: {
          with: {
            clinicUnit: true,
          },
        },
        categoryMappings: {
          with: {
            category: {
              with: {
                clinicUnit: true,
              },
            },
          },
        },
        intakeForm: true,
        clinicServiceComplaints: {
          orderBy: [asc(clinicServiceComplaints.displayOrder)],
        },
      },
    });

    return services.map((s) => {
      const mappings = s.categoryMappings || [];
      const categories = mappings.map((m) => ({
        id: m.category.id,
        name: m.category.name,
        code: m.category.code,
        unitId: m.category.unitId || null,
        unitName: m.category.clinicUnit?.name || null,
        isPrimary: m.isPrimary,
      }));
      const categoryIds = categories.map((c) => c.id);
      if (categoryIds.length === 0 && s.serviceCategoryId) {
        categoryIds.push(s.serviceCategoryId);
      }

      return {
        id: s.id,
        serviceCategoryId: s.serviceCategoryId,
        categoryIds,
        categories,
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
      };
    });
  }

  async createService(
    dto: CreateClinicServiceDto,
  ): Promise<typeof clinicServices.$inferSelect> {
    const rawCategoryIds = dto.categoryIds?.filter(Boolean) || [];
    const primaryCategoryId = dto.serviceCategoryId || rawCategoryIds[0];
    if (!primaryCategoryId) {
      throw new NotFoundException('Setidaknya pilih satu kelompok layanan');
    }
    const finalCategoryIds = Array.from(
      new Set([primaryCategoryId, ...rawCategoryIds].filter(Boolean) as string[]),
    );

    const categories = await this.db.query.serviceCategories.findMany({
      where: inArray(serviceCategories.id, finalCategoryIds),
    });
    if (categories.length === 0) {
      throw new NotFoundException('Kategori layanan tidak ditemukan');
    }

    if (dto.intakeFormId) {
      const form = await this.db.query.clinicalIntakeForms.findFirst({
        where: eq(clinicalIntakeForms.id, dto.intakeFormId),
      });
      if (!form) {
        throw new NotFoundException(
          `Formulir intake dengan ID '${dto.intakeFormId}' tidak ditemukan`,
        );
      }
    }

    const finalCode = await this.resolveUniqueCode(
      dto.code,
      dto.name,
      'service',
      async (code) => {
        const found = await this.db.query.clinicServices.findFirst({
          where: eq(clinicServices.code, code),
        });
        return Boolean(found);
      },
    );

    const finalPrefix = (
      dto.codePrefix?.trim() || CanonicalSlugHelper.toPrefix(dto.name, 4)
    ).toUpperCase();

    return await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(clinicServices)
        .values({
          serviceCategoryId: primaryCategoryId,
          specialtyId: dto.specialtyId || null,
          intakeFormId: dto.intakeFormId || null,
          code: finalCode,
          name: dto.name.trim(),
          shortName: dto.shortName?.trim() || null,
          description: dto.description?.trim() || null,
          codePrefix: finalPrefix,
          iconName: dto.iconName?.trim() || 'stethoscope',
          displayOrder: dto.displayOrder ?? 0,
          isBookable: dto.isBookable ?? true,
          isActive: dto.isActive ?? true,
        })
        .returning();

      if (finalCategoryIds.length > 0) {
        await tx.insert(clinicServiceCategoryMappings).values(
          finalCategoryIds.map((catId) => ({
            serviceId: created.id,
            categoryId: catId,
            isPrimary: catId === primaryCategoryId,
          })),
        );
      }

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

  async updateService(
    id: string,
    dto: UpdateClinicServiceDto,
  ): Promise<typeof clinicServices.$inferSelect> {
    const existing = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Layanan dengan ID '${id}' tidak ditemukan`);
    }

    const rawCategoryIds = dto.categoryIds?.filter(Boolean);
    const primaryCategoryId =
      dto.serviceCategoryId ||
      (rawCategoryIds && rawCategoryIds.length > 0
        ? rawCategoryIds[0]
        : undefined);

    if (primaryCategoryId) {
      const category = await this.db.query.serviceCategories.findFirst({
        where: eq(serviceCategories.id, primaryCategoryId),
      });
      if (!category) {
        throw new NotFoundException(
          `Kategori layanan dengan ID '${primaryCategoryId}' tidak ditemukan`,
        );
      }
    }

    if (dto.intakeFormId !== undefined) {
      if (dto.intakeFormId) {
        const form = await this.db.query.clinicalIntakeForms.findFirst({
          where: eq(clinicalIntakeForms.id, dto.intakeFormId),
        });
        if (!form) {
          throw new NotFoundException(
            `Formulir intake dengan ID '${dto.intakeFormId}' tidak ditemukan`,
          );
        }
      }
    }

    const updates: Partial<typeof clinicServices.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (primaryCategoryId !== undefined)
      updates.serviceCategoryId = primaryCategoryId;
    if (dto.specialtyId !== undefined)
      updates.specialtyId = dto.specialtyId || null;
    if (dto.intakeFormId !== undefined)
      updates.intakeFormId = dto.intakeFormId || null;
    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate = await this.db.query.clinicServices.findFirst({
          where: eq(clinicServices.code, normalizedCode),
        });
        if (duplicate) {
          throw new ConflictException(
            `Layanan dengan kode '${normalizedCode}' sudah digunakan`,
          );
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.shortName !== undefined)
      updates.shortName = dto.shortName?.trim() || null;
    if (dto.description !== undefined)
      updates.description = dto.description?.trim() || null;
    if (dto.codePrefix !== undefined)
      updates.codePrefix = dto.codePrefix.trim().toUpperCase();
    if (dto.iconName !== undefined)
      updates.iconName = dto.iconName?.trim() || 'stethoscope';
    if (dto.displayOrder !== undefined) updates.displayOrder = dto.displayOrder;
    if (dto.isBookable !== undefined) updates.isBookable = dto.isBookable;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    return await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(clinicServices)
        .set(updates)
        .where(eq(clinicServices.id, id))
        .returning();

      if (rawCategoryIds !== undefined || dto.serviceCategoryId !== undefined) {
        const newCatIds = Array.from(
          new Set(
            [
              primaryCategoryId || existing.serviceCategoryId,
              ...(rawCategoryIds || []),
            ].filter(Boolean) as string[],
          ),
        );

        if (newCatIds.length > 0) {
          await tx
            .delete(clinicServiceCategoryMappings)
            .where(eq(clinicServiceCategoryMappings.serviceId, id));

          await tx.insert(clinicServiceCategoryMappings).values(
            newCatIds.map((catId) => ({
              serviceId: id,
              categoryId: catId,
              isPrimary:
                catId === (primaryCategoryId || existing.serviceCategoryId),
            })),
          );
        }
      }

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

    // Verify referential integrity with appointments and clinical encounters
    const [linkedAppointments, linkedEncounters] = await Promise.all([
      this.db.query.appointments.findMany({
        where: eq(appointments.serviceId, id),
      }),
      this.db.query.clinicalEncounters.findMany({
        where: eq(clinicalEncounters.serviceId, id),
      }),
    ]);

    if (linkedAppointments.length > 0 || linkedEncounters.length > 0) {
      throw new ConflictException(
        'Ups! Service medis ini tidak dapat dihapus karena sudah memiliki riwayat pendaftaran atau rekam medis pasien.',
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(clinicServiceComplaints)
        .where(eq(clinicServiceComplaints.serviceId, id));

      await tx.delete(clinicServices).where(eq(clinicServices.id, id));
    });

    await this.invalidateCache();
  }

  // ==========================================
  // 5. CLINICAL INTAKE FORMS (Dynamic Registry)
  // ==========================================

  async getForms(
    search?: string,
    status?: string,
  ): Promise<AdminFormResponse[]> {
    const conditions: Array<SQL | undefined> = [];
    if (status === 'active') conditions.push(eq(clinicalIntakeForms.isActive, true));
    if (status === 'inactive') conditions.push(eq(clinicalIntakeForms.isActive, false));
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(or(ilike(clinicalIntakeForms.name, term), ilike(clinicalIntakeForms.code, term)));
    }
    const validConditions = conditions.filter((c): c is SQL => Boolean(c));
    const whereCondition =
      validConditions.length > 0 ? and(...validConditions) : undefined;

    const forms = await this.db.query.clinicalIntakeForms.findMany({
      where: whereCondition,
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
      schema: f.schema || { steps: [] },
      serviceCount: f.clinicServices?.length || 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  async createForm(
    dto: CreateClinicalIntakeFormDto,
  ): Promise<typeof clinicalIntakeForms.$inferSelect> {
    const finalCode = await this.resolveUniqueCode(
      dto.code,
      dto.name,
      'form',
      async (code) => {
        const found = await this.db.query.clinicalIntakeForms.findFirst({
          where: eq(clinicalIntakeForms.code, code),
        });
        return Boolean(found);
      },
    );

    const [created] = await this.db
      .insert(clinicalIntakeForms)
      .values({
        code: finalCode,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        iconName: dto.iconName?.trim() || 'clipboard-list',
        isActive: dto.isActive ?? true,
        schema: dto.schema || { steps: [] },
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateForm(
    id: string,
    dto: UpdateClinicalIntakeFormDto,
  ): Promise<typeof clinicalIntakeForms.$inferSelect> {
    const existing = await this.db.query.clinicalIntakeForms.findFirst({
      where: eq(clinicalIntakeForms.id, id),
    });
    if (!existing) {
      throw new NotFoundException(`Formulir dengan ID '${id}' tidak ditemukan`);
    }

    const updates: Partial<typeof clinicalIntakeForms.$inferInsert> = {
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
          throw new ConflictException(
            `Formulir dengan kode '${normalizedCode}' sudah digunakan`,
          );
        }
      }
      updates.code = normalizedCode;
    }
    if (dto.description !== undefined)
      updates.description = dto.description?.trim() || null;
    if (dto.iconName !== undefined)
      updates.iconName = dto.iconName?.trim() || 'clipboard-list';
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;
    if (dto.schema !== undefined) updates.schema = dto.schema;

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

    // Verify referential integrity with services linked to this intake form
    const linkedServices = await this.db.query.clinicServices.findMany({
      where: eq(clinicServices.intakeFormId, id),
    });
    if (linkedServices.length > 0) {
      throw new ConflictException(
        `Ups! Formulir ini tidak dapat dihapus karena masih dihubungkan ke ${linkedServices.length} service medis.`,
      );
    }

    await this.db
      .delete(clinicalIntakeForms)
      .where(eq(clinicalIntakeForms.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 6. PATIENT RELATIONSHIP TYPES (Relasi Pasien)
  // ==========================================

  async getRelationships(): Promise<AdminRelationshipResponse[]> {
    const list = await this.db.query.patientRelationshipTypes.findMany({
      orderBy: [
        asc(patientRelationshipTypes.displayOrder),
        asc(patientRelationshipTypes.name),
      ],
      with: {
        affiliations: true,
      },
    });

    return list.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description,
      iconName: item.iconName,
      displayOrder: item.displayOrder,
      isActive: item.isActive,
      isSystem: item.isSystem,
      usageCount: item.affiliations?.length || 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }

  async createRelationship(
    dto: CreateFacilityRelationshipInput,
  ): Promise<typeof patientRelationshipTypes.$inferSelect> {
    const finalCode = await this.resolveUniqueCode(
      dto.code,
      dto.name,
      'rel',
      async (code) => {
        const found = await this.db.query.patientRelationshipTypes.findFirst({
          where: eq(patientRelationshipTypes.code, code),
        });
        return Boolean(found);
      },
    );

    const shouldBeSystem = Boolean(dto.isSystem);
    if (shouldBeSystem) {
      await this.db
        .update(patientRelationshipTypes)
        .set({ isSystem: false, updatedAt: new Date().toISOString() });
    }

    const [created] = await this.db
      .insert(patientRelationshipTypes)
      .values({
        code: finalCode,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        iconName: dto.iconName?.trim() || 'user',
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
        isSystem: shouldBeSystem,
      })
      .returning();

    await this.invalidateCache();
    return created;
  }

  async updateRelationship(
    id: string,
    dto: UpdateFacilityRelationshipInput,
  ): Promise<typeof patientRelationshipTypes.$inferSelect> {
    const existing = await this.db.query.patientRelationshipTypes.findFirst({
      where: eq(patientRelationshipTypes.id, id),
    });
    if (!existing) {
      throw new NotFoundException(
        `Relasi pasien dengan ID '${id}' tidak ditemukan`,
      );
    }

    const updates: Partial<typeof patientRelationshipTypes.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (dto.name !== undefined) updates.name = dto.name.trim();

    // Auto re-slugging: jika kode tidak ditentukan manual dan nama berubah, buat slug baru yang selaras
    if (
      dto.code === undefined &&
      dto.name !== undefined &&
      dto.name.trim() !== existing.name
    ) {
      const newDerivedCode = await this.resolveUniqueCode(
        undefined,
        dto.name.trim(),
        'rel',
        async (candidate) => {
          const found = await this.db.query.patientRelationshipTypes.findFirst({
            where: and(
              eq(patientRelationshipTypes.code, candidate),
              ne(patientRelationshipTypes.id, id),
            ),
          });
          return Boolean(found);
        },
      );
      updates.code = newDerivedCode;
    } else if (dto.code !== undefined) {
      const normalizedCode = dto.code.trim().toLowerCase().replace(/-/g, '_');
      if (normalizedCode !== existing.code) {
        const duplicate =
          await this.db.query.patientRelationshipTypes.findFirst({
            where: and(
              eq(patientRelationshipTypes.code, normalizedCode),
              ne(patientRelationshipTypes.id, id),
            ),
          });
        if (duplicate) {
          throw new ConflictException(
            `Relasi pasien dengan kode '${normalizedCode}' sudah digunakan`,
          );
        }
      }
      updates.code = normalizedCode;
    }

    if (dto.description !== undefined)
      updates.description = dto.description?.trim() || null;
    if (dto.iconName !== undefined)
      updates.iconName = dto.iconName?.trim() || 'user';
    if (dto.displayOrder !== undefined) updates.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;

    if (dto.isSystem !== undefined) {
      if (dto.isSystem) {
        await this.db
          .update(patientRelationshipTypes)
          .set({ isSystem: false, updatedAt: new Date().toISOString() })
          .where(ne(patientRelationshipTypes.id, id));
        updates.isSystem = true;
      } else {
        updates.isSystem = false;
      }
    }

    const [updated] = await this.db
      .update(patientRelationshipTypes)
      .set(updates)
      .where(eq(patientRelationshipTypes.id, id))
      .returning();

    await this.invalidateCache();
    return updated;
  }

  async setDefaultRelationship(
    id: string,
  ): Promise<typeof patientRelationshipTypes.$inferSelect> {
    const existing = await this.db.query.patientRelationshipTypes.findFirst({
      where: eq(patientRelationshipTypes.id, id),
    });
    if (!existing) {
      throw new NotFoundException(
        `Relasi pasien dengan ID '${id}' tidak ditemukan`,
      );
    }

    return await this.db.transaction(async (tx) => {
      await tx
        .update(patientRelationshipTypes)
        .set({ isSystem: false, updatedAt: new Date().toISOString() })
        .where(ne(patientRelationshipTypes.id, id));

      const [updated] = await tx
        .update(patientRelationshipTypes)
        .set({
          isSystem: true,
          isActive: true,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(patientRelationshipTypes.id, id))
        .returning();

      await this.invalidateCache();
      return updated;
    });
  }

  async deleteRelationship(id: string): Promise<void> {
    const existing = await this.db.query.patientRelationshipTypes.findFirst({
      where: eq(patientRelationshipTypes.id, id),
    });
    if (!existing) {
      throw new NotFoundException(
        `Relasi pasien dengan ID '${id}' tidak ditemukan`,
      );
    }

    if (existing.isSystem) {
      throw new ConflictException(
        `Relasi sistem '${existing.name}' dilindungi dan tidak dapat dihapus permanen.`,
      );
    }

    const linkedAffiliations = await this.db.query.patientAffiliations.findMany({
      where: eq(patientAffiliations.relationshipTypeId, id),
    });
    if (linkedAffiliations.length > 0) {
      throw new ConflictException(
        `Ups! Relasi ini tidak dapat dihapus karena masih digunakan oleh ${linkedAffiliations.length} data afiliasi pasien.`,
      );
    }

    await this.db
      .delete(patientRelationshipTypes)
      .where(eq(patientRelationshipTypes.id, id));

    await this.invalidateCache();
  }

  // ==========================================
  // 7. BULK FACILITY ACTIONS
  // ==========================================

  async bulkAction(
    dto: BulkFacilityActionInput,
  ): Promise<{ success: boolean; affectedCount: number; message: string }> {
    const { resource, action, ids } = dto;
    const now = new Date().toISOString();

    if (resource === 'unit-types') {
      if (action === 'activate') {
        await this.db
          .update(clinicUnitTypes)
          .set({ isActive: true, updatedAt: now })
          .where(inArray(clinicUnitTypes.id, ids));
      } else if (action === 'deactivate') {
        const linkedUnits = await this.db.query.clinicUnits.findMany({
          where: inArray(clinicUnits.unitTypeId, ids),
        });
        const activeUnits = linkedUnits.filter((u) => u.isActive);
        if (activeUnits.length > 0) {
          throw new ConflictException(
            `Ups! Gagal menonaktifkan: ${activeUnits.length} unit fasilitas aktif masih terhubung dengan tipe unit yang dipilih.`,
          );
        }
        await this.db
          .update(clinicUnitTypes)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(clinicUnitTypes.id, ids));
      } else {
        // action === 'delete' (Hard Purge)
        const linkedUnits = await this.db.query.clinicUnits.findMany({
          where: inArray(clinicUnits.unitTypeId, ids),
        });
        if (linkedUnits.length > 0) {
          throw new ConflictException(
            `Ups! Gagal menghapus permanen: ${linkedUnits.length} unit fasilitas masih terhubung dengan klasifikasi yang dipilih. Pindahkan atau hapus unit terkait terlebih dahulu.`,
          );
        }
        await this.db
          .delete(clinicUnitTypes)
          .where(inArray(clinicUnitTypes.id, ids));
      }
    } else if (resource === 'units') {
      if (action === 'activate') {
        // Ensure parent unit type is active
        const unitsToActivate = await this.db.query.clinicUnits.findMany({
          where: inArray(clinicUnits.id, ids),
          with: { clinicUnitType: true },
        });
        const inactiveParent = unitsToActivate.find(
          (u) => u.clinicUnitType && !u.clinicUnitType.isActive,
        );
        if (inactiveParent) {
          throw new ConflictException(
            `Unit '${inactiveParent.name}' tidak dapat diaktifkan karena tipe unit '${inactiveParent.clinicUnitType?.name}' sedang nonaktif.`,
          );
        }
        await this.db
          .update(clinicUnits)
          .set({ isActive: true, updatedAt: now })
          .where(inArray(clinicUnits.id, ids));
      } else if (action === 'deactivate') {
        // Cascade deactivation to linked rooms & categories
        await this.db
          .update(clinicUnits)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(clinicUnits.id, ids));
        await this.db
          .update(clinicRooms)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(clinicRooms.unitId, ids));
        await this.db
          .update(serviceCategories)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(serviceCategories.unitId, ids));
      } else {
        // action === 'delete' (Hard Purge)
        const [linkedRooms, linkedCats, linkedStaff] = await Promise.all([
          this.db.query.clinicRooms.findMany({
            where: inArray(clinicRooms.unitId, ids),
          }),
          this.db.query.serviceCategories.findMany({
            where: inArray(serviceCategories.unitId, ids),
          }),
          this.db.query.staffProfiles.findMany({
            where: inArray(staffProfiles.primaryUnitId, ids),
          }),
        ]);
        if (
          linkedRooms.length > 0 ||
          linkedCats.length > 0 ||
          linkedStaff.length > 0
        ) {
          throw new ConflictException(
            `Ups! Gagal menghapus permanen: unit terpilih masih terhubung dengan ${linkedRooms.length} ruangan, ${linkedCats.length} kelompok layanan, atau ${linkedStaff.length} staf. Lepaskan keterkaitan terlebih dahulu.`,
          );
        }
        await this.db
          .delete(clinicUnits)
          .where(inArray(clinicUnits.id, ids));
      }
    } else if (resource === 'rooms') {
      if (action === 'activate') {
        const roomsToActivate = await this.db.query.clinicRooms.findMany({
          where: inArray(clinicRooms.id, ids),
          with: { clinicUnit: true },
        });
        const inactiveParent = roomsToActivate.find(
          (r) => r.clinicUnit && !r.clinicUnit.isActive,
        );
        if (inactiveParent) {
          throw new ConflictException(
            `Ruangan '${inactiveParent.name}' tidak dapat diaktifkan karena unit induk '${inactiveParent.clinicUnit?.name}' sedang nonaktif.`,
          );
        }
        await this.db
          .update(clinicRooms)
          .set({ isActive: true, updatedAt: now })
          .where(inArray(clinicRooms.id, ids));
      } else if (action === 'deactivate') {
        await this.db
          .update(clinicRooms)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(clinicRooms.id, ids));
      } else {
        // action === 'delete' (Hard Purge)
        const [linkedAppointments, linkedTickets, linkedDoctors] =
          await Promise.all([
            this.db.query.appointments.findMany({
              where: inArray(appointments.roomId, ids),
            }),
            this.db.query.queueTickets.findMany({
              where: inArray(queueTickets.roomId, ids),
            }),
            this.db.query.practitioners.findMany({
              where: inArray(practitioners.defaultRoomId, ids),
            }),
          ]);
        if (
          linkedAppointments.length > 0 ||
          linkedTickets.length > 0 ||
          linkedDoctors.length > 0
        ) {
          throw new ConflictException(
            'Ups! Beberapa ruangan tidak dapat dihapus permanen karena memiliki riwayat janji temu atau penugasan dokter.',
          );
        }
        await this.db
          .delete(clinicRooms)
          .where(inArray(clinicRooms.id, ids));
      }
    } else if (resource === 'categories') {
      if (action === 'activate') {
        const catsToActivate = await this.db.query.serviceCategories.findMany({
          where: inArray(serviceCategories.id, ids),
          with: { clinicUnit: true },
        });
        const inactiveParent = catsToActivate.find(
          (c) => c.clinicUnit && !c.clinicUnit.isActive,
        );
        if (inactiveParent) {
          throw new ConflictException(
            `Kategori '${inactiveParent.name}' tidak dapat diaktifkan karena unit induk '${inactiveParent.clinicUnit?.name}' sedang nonaktif.`,
          );
        }
        await this.db
          .update(serviceCategories)
          .set({ isActive: true, updatedAt: now })
          .where(inArray(serviceCategories.id, ids));
      } else if (action === 'deactivate') {
        await this.db
          .update(serviceCategories)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(serviceCategories.id, ids));
        // Cascade deactivation to services under these categories
        await this.db
          .update(clinicServices)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(clinicServices.serviceCategoryId, ids));
      } else {
        // action === 'delete' (Hard Purge)
        const linkedServices = await this.db.query.clinicServices.findMany({
          where: inArray(clinicServices.serviceCategoryId, ids),
        });
        if (linkedServices.length > 0) {
          throw new ConflictException(
            `Ups! Gagal menghapus permanen: ${linkedServices.length} service medis masih berada di dalam kelompok layanan terpilih.`,
          );
        }
        await this.db
          .delete(serviceCategories)
          .where(inArray(serviceCategories.id, ids));
      }
    } else if (resource === 'services') {
      if (action === 'activate') {
        const servsToActivate = await this.db.query.clinicServices.findMany({
          where: inArray(clinicServices.id, ids),
          with: { serviceCategory: true },
        });
        const inactiveParent = servsToActivate.find(
          (s) => s.serviceCategory && !s.serviceCategory.isActive,
        );
        if (inactiveParent) {
          throw new ConflictException(
            `Layanan '${inactiveParent.name}' tidak dapat diaktifkan karena kategori '${inactiveParent.serviceCategory?.name}' sedang nonaktif.`,
          );
        }
        await this.db
          .update(clinicServices)
          .set({ isActive: true, updatedAt: now })
          .where(inArray(clinicServices.id, ids));
      } else if (action === 'deactivate') {
        await this.db
          .update(clinicServices)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(clinicServices.id, ids));
      } else {
        // action === 'delete' (Hard Purge)
        const [linkedAppointments, linkedEncounters] = await Promise.all([
          this.db.query.appointments.findMany({
            where: inArray(appointments.serviceId, ids),
          }),
          this.db.query.clinicalEncounters.findMany({
            where: inArray(clinicalEncounters.serviceId, ids),
          }),
        ]);
        if (linkedAppointments.length > 0 || linkedEncounters.length > 0) {
          throw new ConflictException(
            'Ups! Beberapa service medis tidak dapat dihapus permanen karena memiliki riwayat pendaftaran atau rekam medis pasien.',
          );
        }
        await this.db.transaction(async (tx) => {
          await tx
            .delete(clinicServiceComplaints)
            .where(inArray(clinicServiceComplaints.serviceId, ids));
          await tx
            .delete(clinicServices)
            .where(inArray(clinicServices.id, ids));
        });
      }
    } else if (resource === 'forms') {
      if (action === 'activate') {
        await this.db
          .update(clinicalIntakeForms)
          .set({ isActive: true, updatedAt: now })
          .where(inArray(clinicalIntakeForms.id, ids));
      } else if (action === 'deactivate') {
        const linkedServices = await this.db.query.clinicServices.findMany({
          where: inArray(clinicServices.intakeFormId, ids),
        });
        const activeServices = linkedServices.filter((s) => s.isActive);
        if (activeServices.length > 0) {
          throw new ConflictException(
            `Formulir intake tidak dapat dinonaktifkan karena masih digunakan oleh ${activeServices.length} layanan medis aktif.`,
          );
        }
        await this.db
          .update(clinicalIntakeForms)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(clinicalIntakeForms.id, ids));
      } else {
        // action === 'delete' (Hard Purge)
        const linkedServices = await this.db.query.clinicServices.findMany({
          where: inArray(clinicServices.intakeFormId, ids),
        });
        if (linkedServices.length > 0) {
          throw new ConflictException(
            `Ups! Gagal menghapus permanen: ${linkedServices.length} service medis masih terhubung ke formulir pengkajian terpilih.`,
          );
        }
        await this.db
          .delete(clinicalIntakeForms)
          .where(inArray(clinicalIntakeForms.id, ids));
      }
    } else if (resource === 'relationships') {
      if (action === 'activate') {
        await this.db
          .update(patientRelationshipTypes)
          .set({ isActive: true, updatedAt: now })
          .where(inArray(patientRelationshipTypes.id, ids));
      } else if (action === 'deactivate') {
        await this.db
          .update(patientRelationshipTypes)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(patientRelationshipTypes.id, ids));
      } else {
        // action === 'delete' (Hard Purge)
        const items = await this.db.query.patientRelationshipTypes.findMany({
          where: inArray(patientRelationshipTypes.id, ids),
        });
        const systemItem = items.find((i) => i.isSystem);
        if (systemItem) {
          throw new ConflictException(
            `Relasi sistem '${systemItem.name}' dilindungi dan tidak dapat dihapus.`,
          );
        }

        const linkedAffiliations =
          await this.db.query.patientAffiliations.findMany({
            where: inArray(patientAffiliations.relationshipTypeId, ids),
          });
        if (linkedAffiliations.length > 0) {
          throw new ConflictException(
            `Ups! Relasi yang dipilih masih digunakan oleh ${linkedAffiliations.length} data afiliasi pasien.`,
          );
        }

        await this.db
          .delete(patientRelationshipTypes)
          .where(inArray(patientRelationshipTypes.id, ids));
      }
    }

    await this.invalidateCache();

    const actionText =
      action === 'activate'
        ? 'diaktifkan'
        : action === 'deactivate'
          ? 'dinonaktifkan'
          : 'dihapus permanen';

    return {
      success: true,
      affectedCount: ids.length,
      message: `Berhasil memproses ${ids.length} data fasilitas (${actionText}).`,
    };
  }
}

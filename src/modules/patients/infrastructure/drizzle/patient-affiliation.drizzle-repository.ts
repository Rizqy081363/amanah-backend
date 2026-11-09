import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  patientAffiliations,
  patientRelationshipTypes,
} from '../../../../database/schema';
import {
  PatientAffiliationEntity,
  type PatientRelationshipType,
} from '../../domain/entities/patient-affiliation.entity';
import type {
  CreateAffiliationParams,
  PatientAffiliationRepository,
} from '../../domain/repositories/patient-affiliation.repository';
import { PatientRecordMapper } from './patient-record.mapper';
import { NikSecurityService } from '../../../../common/security/nik';

@Injectable()
export class PatientAffiliationDrizzleRepository
  implements PatientAffiliationRepository
{
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly nikSecurity: NikSecurityService,
  ) {}

  async findByUserId(userId: string): Promise<PatientAffiliationEntity[]> {
    const records = await this.db.query.patientAffiliations.findMany({
      where: eq(patientAffiliations.userId, userId),
      orderBy: [
        desc(patientAffiliations.isPrimary),
        desc(patientAffiliations.createdAt),
      ],
      with: {
        relationshipType: true,
        patientProfile: {
          with: {
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
      },
    });

    return records.map((record) => {
      const entity = new PatientAffiliationEntity();
      entity.id = record.id;
      entity.userId = record.userId;
      entity.patientId = record.patientId;
      entity.relationshipTypeId = record.relationshipTypeId;
      entity.relationshipType =
        (record.relationshipType?.code as PatientRelationshipType) ||
        record.relationLabel ||
        '';
      entity.relationLabel =
        record.relationshipType?.name || record.relationLabel || null;
      entity.iconName = record.relationshipType?.iconName || null;
      entity.isSystem = Boolean(record.relationshipType?.isSystem);
      entity.isPrimary = record.isPrimary;
      entity.createdAt = new Date(record.createdAt);
      entity.updatedAt = new Date(record.updatedAt);
      if (record.patientProfile) {
        entity.patient = PatientRecordMapper.toEntity(
          record.patientProfile,
          this.nikSecurity,
        );
      }
      return entity;
    });
  }

  async findByUserAndPatient(
    userId: string,
    patientId: string,
    tx?: unknown,
  ): Promise<PatientAffiliationEntity | null> {
    const client = (tx as DrizzleDatabase) || this.db;
    const record = await client.query.patientAffiliations.findFirst({
      where: and(
        eq(patientAffiliations.userId, userId),
        eq(patientAffiliations.patientId, patientId),
      ),
      with: {
        relationshipType: true,
        patientProfile: {
          with: {
            patientAddresses: true,
            patientEmergencyContacts: true,
          },
        },
      },
    });

    if (!record) return null;

    const entity = new PatientAffiliationEntity();
    entity.id = record.id;
    entity.userId = record.userId;
    entity.patientId = record.patientId;
    entity.relationshipTypeId = record.relationshipTypeId;
    entity.relationshipType =
      (record.relationshipType?.code as PatientRelationshipType) ||
      record.relationLabel ||
      '';
    entity.relationLabel =
      record.relationshipType?.name || record.relationLabel || null;
    entity.iconName = record.relationshipType?.iconName || null;
    entity.isSystem = Boolean(record.relationshipType?.isSystem);
    entity.isPrimary = record.isPrimary;
    entity.createdAt = new Date(record.createdAt);
    entity.updatedAt = new Date(record.updatedAt);
    if (record.patientProfile) {
      entity.patient = PatientRecordMapper.toEntity(
        record.patientProfile,
        this.nikSecurity,
      );
    }
    return entity;
  }

  async create(
    params: CreateAffiliationParams,
    tx?: unknown,
  ): Promise<PatientAffiliationEntity> {
    const client = (tx as DrizzleDatabase) || this.db;

    if (params.isPrimary) {
      await client
        .update(patientAffiliations)
        .set({ isPrimary: false, updatedAt: new Date().toISOString() })
        .where(eq(patientAffiliations.userId, params.userId));
    }

    let targetRelationshipTypeId = params.relationshipTypeId;
    if (!targetRelationshipTypeId && params.relationshipType) {
      const found = await client.query.patientRelationshipTypes.findFirst({
        where: eq(
          patientRelationshipTypes.code,
          params.relationshipType.toLowerCase(),
        ),
      });
      if (found) {
        targetRelationshipTypeId = found.id;
      }
    }
    if (!targetRelationshipTypeId && params.isPrimary) {
      const primaryType =
        await client.query.patientRelationshipTypes.findFirst({
          where: eq(patientRelationshipTypes.isSystem, true),
          orderBy: [asc(patientRelationshipTypes.displayOrder)],
        });
      targetRelationshipTypeId = primaryType?.id;
    }
    if (!targetRelationshipTypeId) {
      const fallbackAny =
        await client.query.patientRelationshipTypes.findFirst({
          where: eq(patientRelationshipTypes.isActive, true),
          orderBy: [asc(patientRelationshipTypes.displayOrder)],
        });
      targetRelationshipTypeId = fallbackAny?.id;
    }
    if (!targetRelationshipTypeId) {
      throw new Error(
        'Tipe relasi pasien belum terdaftar di sistem. Silakan tambahkan relasi pasien terlebih dahulu.',
      );
    }

    const [record] = await client
      .insert(patientAffiliations)
      .values({
        userId: params.userId,
        patientId: params.patientId,
        relationshipTypeId: targetRelationshipTypeId,
        relationLabel: params.relationLabel || null,
        isPrimary: params.isPrimary ?? false,
      })
      .onConflictDoUpdate({
        target: [patientAffiliations.userId, patientAffiliations.patientId],
        set: {
          relationshipTypeId: targetRelationshipTypeId,
          relationLabel: params.relationLabel || null,
          isPrimary: params.isPrimary ?? false,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    const created = await this.findByUserAndPatient(
      record.userId,
      record.patientId,
      client,
    );
    return created!;
  }

  async update(
    id: string,
    params: Partial<CreateAffiliationParams>,
    tx?: unknown,
  ): Promise<PatientAffiliationEntity | null> {
    const client = (tx as DrizzleDatabase) || this.db;
    const existing = await client.query.patientAffiliations.findFirst({
      where: eq(patientAffiliations.id, id),
    });
    if (!existing) return null;

    if (params.isPrimary) {
      await client
        .update(patientAffiliations)
        .set({ isPrimary: false, updatedAt: new Date().toISOString() })
        .where(eq(patientAffiliations.userId, existing.userId));
    }

    const updateSet: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (params.relationshipTypeId) {
      updateSet.relationshipTypeId = params.relationshipTypeId;
    } else if (params.relationshipType) {
      const found = await client.query.patientRelationshipTypes.findFirst({
        where: eq(
          patientRelationshipTypes.code,
          params.relationshipType.toLowerCase(),
        ),
      });
      if (found) {
        updateSet.relationshipTypeId = found.id;
      }
    }
    if (params.relationLabel !== undefined) {
      updateSet.relationLabel = params.relationLabel;
    }
    if (params.isPrimary !== undefined) {
      updateSet.isPrimary = params.isPrimary;
    }

    await client
      .update(patientAffiliations)
      .set(updateSet)
      .where(eq(patientAffiliations.id, id));

    return this.findByUserAndPatient(existing.userId, existing.patientId, client);
  }

  async delete(
    userId: string,
    patientId: string,
    tx?: unknown,
  ): Promise<boolean> {
    const client = (tx as DrizzleDatabase) || this.db;
    const deleted = await client
      .delete(patientAffiliations)
      .where(
        and(
          eq(patientAffiliations.userId, userId),
          eq(patientAffiliations.patientId, patientId),
        ),
      )
      .returning();

    return deleted.length > 0;
  }
}

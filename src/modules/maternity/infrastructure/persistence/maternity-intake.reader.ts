import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
} from 'drizzle-orm';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { maternalHealthIntakes } from '../../../../database/schema/amanah.schema';
import { MaternityIntakeEntity } from '../../domain/entities/maternity-intake.entity';
import {
  MaternityHistoryQuery,
  MaternityHistoryResult,
} from '../../domain/repositories/maternity.repository.interface';
import { mapToMaternityEntity } from '../drizzle/maternity-persistence.helper';

export const MATERNITY_RELATIONS = {
  husband: true,
  healthConditions: true,
  previousPregnancies: true,
  contraceptiveHistories: true,
} as const;

export class MaternityIntakeReader {
  constructor(private readonly db: DrizzleDatabase) {}

  async findById(id: string): Promise<MaternityIntakeEntity | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: eq(maternalHealthIntakes.id, id),
      with: MATERNITY_RELATIONS,
    });
    if (!record) return null;
    return mapToMaternityEntity(record);
  }

  async findByAppointmentId(
    appointmentId: string,
  ): Promise<MaternityIntakeEntity | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: eq(maternalHealthIntakes.appointmentId, appointmentId),
      with: MATERNITY_RELATIONS,
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });
    if (!record) return null;
    return mapToMaternityEntity(record);
  }

  async findLatestByPatientId(
    patientId: string,
  ): Promise<MaternityIntakeEntity | null> {
    const record = await this.db.query.maternalHealthIntakes.findFirst({
      where: eq(maternalHealthIntakes.patientId, patientId),
      with: MATERNITY_RELATIONS,
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });
    if (!record) return null;
    return mapToMaternityEntity(record);
  }

  async findByPatientId(patientId: string): Promise<MaternityIntakeEntity[]> {
    const records = await this.db.query.maternalHealthIntakes.findMany({
      where: eq(maternalHealthIntakes.patientId, patientId),
      with: MATERNITY_RELATIONS,
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });
    return records.map(mapToMaternityEntity);
  }

  async findMaternalHistory(
    patientIds: string[],
    query: MaternityHistoryQuery,
  ): Promise<MaternityHistoryResult> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (patientIds && patientIds.length > 0) {
      conditions.push(inArray(maternalHealthIntakes.patientId, patientIds));
    } else if (query.patientId) {
      conditions.push(eq(maternalHealthIntakes.patientId, query.patientId));
    } else {
      return {
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      if (/^\d{16}$/.test(term)) {
        conditions.push(eq(maternalHealthIntakes.motherNik, term));
      } else {
        conditions.push(
          or(
            ilike(maternalHealthIntakes.motherName, `%${term}%`),
            ilike(maternalHealthIntakes.motherNik, `%${term}%`),
          )!,
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await this.db
      .select({ count: count() })
      .from(maternalHealthIntakes)
      .where(whereClause);

    const total = Number(totalRes?.count || 0);

    const records = await this.db.query.maternalHealthIntakes.findMany({
      where: whereClause,
      with: MATERNITY_RELATIONS,
      limit,
      offset,
      orderBy: [desc(maternalHealthIntakes.createdAt)],
    });

    return {
      data: records.map(mapToMaternityEntity),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }
}

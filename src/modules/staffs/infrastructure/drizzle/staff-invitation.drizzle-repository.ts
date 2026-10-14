import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffInvitations } from '../../../../database/schema';
import { StaffInvitationEntity } from '../../domain/entities/staff-invitation.entity';
import { StaffInvitationRepository } from '../../domain/repositories/staff-invitation.repository';

@Injectable()
export class StaffInvitationDrizzleRepository
  implements StaffInvitationRepository
{
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  private mapRecordToEntity(r: any): StaffInvitationEntity {
    return {
      id: r.id,
      email: r.email,
      roleCode: r.roleCode,
      staffType: r.staffType,
      tokenHash: r.tokenHash,
      temporaryPasswordHash: r.temporaryPasswordHash || null,
      invitedBy: r.invitedBy || null,
      status: r.status,
      expiresAt: new Date(r.expiresAt),
      acceptedAt: r.acceptedAt ? new Date(r.acceptedAt) : null,
      metadata: r.metadata || {},
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async create(
    data: Omit<StaffInvitationEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StaffInvitationEntity> {
    const [record] = await this.db
      .insert(staffInvitations)
      .values({
        email: data.email.toLowerCase().trim(),
        roleCode: data.roleCode,
        staffType: data.staffType,
        tokenHash: data.tokenHash,
        temporaryPasswordHash: data.temporaryPasswordHash || null,
        invitedBy: data.invitedBy || null,
        status: data.status,
        expiresAt: data.expiresAt.toISOString(),
        metadata: data.metadata || {},
      })
      .returning();

    return this.mapRecordToEntity(record);
  }

  async findById(id: string): Promise<StaffInvitationEntity | null> {
    const record = await this.db.query.staffInvitations.findFirst({
      where: eq(staffInvitations.id, id),
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByEmail(email: string): Promise<StaffInvitationEntity[]> {
    const records = await this.db.query.staffInvitations.findMany({
      where: eq(staffInvitations.email, email.toLowerCase().trim()),
      orderBy: [desc(staffInvitations.createdAt)],
    });
    return records.map((r) => this.mapRecordToEntity(r));
  }

  async findPendingByEmail(
    email: string,
  ): Promise<StaffInvitationEntity | null> {
    const record = await this.db.query.staffInvitations.findFirst({
      where: and(
        eq(staffInvitations.email, email.toLowerCase().trim()),
        eq(staffInvitations.status, 'pending'),
      ),
      orderBy: [desc(staffInvitations.createdAt)],
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<StaffInvitationEntity | null> {
    const record = await this.db.query.staffInvitations.findFirst({
      where: eq(staffInvitations.tokenHash, tokenHash),
    });
    return record ? this.mapRecordToEntity(record) : null;
  }

  async findAll(options?: {
    status?: string;
  }): Promise<StaffInvitationEntity[]> {
    const whereClause = options?.status
      ? eq(staffInvitations.status, options.status)
      : undefined;

    const records = await this.db.query.staffInvitations.findMany({
      where: whereClause,
      orderBy: [desc(staffInvitations.createdAt)],
    });
    return records.map((r) => this.mapRecordToEntity(r));
  }

  async updateStatus(
    id: string,
    status: 'pending' | 'accepted' | 'expired' | 'revoked',
  ): Promise<StaffInvitationEntity | null> {
    const updateValues: Record<string, any> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (status === 'accepted') {
      updateValues.acceptedAt = new Date().toISOString();
    }

    const [updated] = await this.db
      .update(staffInvitations)
      .set(updateValues)
      .where(eq(staffInvitations.id, id))
      .returning();

    return updated ? this.mapRecordToEntity(updated) : null;
  }
}

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  practitioners,
  sessionDefs,
  staffProfiles,
} from '../../../../database/schema';
import { replacementOpportunities } from '../../../../database/schema/leave-payroll.schema';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { formatSessionTitle } from '../../../schedules/domain/constants/schedule-shift.constants';
import { ReplacementOpportunityEntity } from '../../domain/entities/replacement-opportunity.entity';
import {
  type ReplacementOpportunityFilter,
  type ReplacementRepository,
} from '../../domain/repositories/replacement.repository';

@Injectable()
export class ReplacementDrizzleRepository implements ReplacementRepository {
  private readonly logger = new Logger(ReplacementDrizzleRepository.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
  ) {}

  private mapOpportunity(r: any): ReplacementOpportunityEntity {
    return {
      id: r.id,
      leaveRequestId: r.leaveRequestId,
      sessionId: r.sessionId,
      sessionCode: r.sessionDef?.code || undefined,
      sessionLabel: formatSessionTitle(r.sessionDef?.code),
      startTime: r.sessionDef?.defaultStartsAt || null,
      endTime: r.sessionDef?.defaultEndsAt || null,
      workDate: r.workDate,
      originalStaffProfileId: r.originalStaffProfileId,
      originalPractitionerId: r.originalPractitionerId || null,
      originalStaffName: r.originalStaffProfile?.fullName || undefined,
      originalStaffRole:
        r.originalPractitioner?.medicalSpecialty?.name ||
        r.originalStaffProfile?.positionTitle ||
        r.originalStaffProfile?.staffType ||
        null,
      originalStaffAvatarUrl: r.originalStaffProfile?.avatarUrl || null,
      leaveReason: r.leaveRequest?.reason || null,
      claimedByStaffProfileId: r.claimedByStaffProfileId || null,
      claimedByPractitionerId: r.claimedByPractitionerId || null,
      claimedByName: r.claimedByStaffProfile?.fullName || null,
      claimedByRole:
        r.claimedByPractitioner?.medicalSpecialty?.name ||
        r.claimedByStaffProfile?.positionTitle ||
        r.claimedByStaffProfile?.staffType ||
        null,
      claimedByAvatarUrl: r.claimedByStaffProfile?.avatarUrl || null,
      claimedAt: r.claimedAt ? new Date(r.claimedAt) : null,
      status: r.status,
      notes: r.notes || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  async findOpportunities(
    filters?: ReplacementOpportunityFilter,
  ): Promise<ReplacementOpportunityEntity[]> {
    const conditions = [];

    // Date filtering
    if (filters?.startDate && filters?.endDate) {
      conditions.push(gte(replacementOpportunities.workDate, filters.startDate));
      conditions.push(lte(replacementOpportunities.workDate, filters.endDate));
    } else if (filters?.startDate) {
      conditions.push(gte(replacementOpportunities.workDate, filters.startDate));
    } else if (filters?.endDate) {
      conditions.push(lte(replacementOpportunities.workDate, filters.endDate));
    } else if (filters?.date && filters.date !== 'all') {
      conditions.push(gte(replacementOpportunities.workDate, filters.date));
    } else if (!filters?.date && filters?.status === 'open') {
      // Mobile app default for open opportunities: upcoming/today only
      const todayStr = new Date().toISOString().split('T')[0];
      conditions.push(gte(replacementOpportunities.workDate, todayStr));
    }

    // Status filtering: If provided and not 'all', filter by exact status
    const statusFilter = filters?.status;
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(replacementOpportunities.status, statusFilter));
    }

    const records = await this.db.query.replacementOpportunities.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        sessionDef: true,
        originalStaffProfile: true,
        originalPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        claimedByStaffProfile: true,
        claimedByPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        leaveRequest: true,
      },
      orderBy: [desc(replacementOpportunities.workDate)],
    });

    return records.map((r) => this.mapOpportunity(r));
  }

  async findOpenOpportunities(
    date?: string,
  ): Promise<ReplacementOpportunityEntity[]> {
    return this.findOpportunities({ date, status: 'open' });
  }

  async findByLeaveRequestId(
    leaveRequestId: string,
  ): Promise<ReplacementOpportunityEntity[]> {
    const records = await this.db.query.replacementOpportunities.findMany({
      where: eq(replacementOpportunities.leaveRequestId, leaveRequestId),
      with: {
        sessionDef: true,
        originalStaffProfile: true,
        originalPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        claimedByStaffProfile: true,
        claimedByPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        leaveRequest: true,
      },
      orderBy: [replacementOpportunities.workDate],
    });

    return records.map((r) => this.mapOpportunity(r));
  }

  async createOpportunity(data: {
    leaveRequestId: string;
    sessionId: string;
    workDate: string;
    originalStaffProfileId: string;
    originalPractitionerId?: string;
    notes?: string;
  }): Promise<ReplacementOpportunityEntity> {
    const [inserted] = await this.db
      .insert(replacementOpportunities)
      .values({
        leaveRequestId: data.leaveRequestId,
        sessionId: data.sessionId,
        workDate: data.workDate,
        originalStaffProfileId: data.originalStaffProfileId,
        originalPractitionerId: data.originalPractitionerId || null,
        status: 'open',
        notes: data.notes || null,
      })
      .returning();

    void this.dispatchNewOpportunityNotification(inserted.id, data.workDate);

    return this.mapOpportunity(inserted);
  }

  async claimOpportunity(
    opportunityId: string,
    staffProfileId: string,
    practitionerId?: string,
  ): Promise<ReplacementOpportunityEntity> {
    const [existing] = await this.db
      .select()
      .from(replacementOpportunities)
      .where(eq(replacementOpportunities.id, opportunityId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Peluang pengganti tidak ditemukan');
    }

    if (existing.originalStaffProfileId === staffProfileId) {
      throw new BadRequestException(
        'Anda tidak dapat mengambil jadwal pengganti dari pengajuan cuti Anda sendiri',
      );
    }

    if (existing.status !== 'open') {
      throw new ConflictException(
        'Peluang pengganti ini sudah diambil oleh rekan lain atau tidak lagi terbuka',
      );
    }

    let resolvedPractitionerId = practitionerId || null;
    if (!resolvedPractitionerId) {
      const p = await this.db.query.practitioners.findFirst({
        where: eq(practitioners.staffProfileId, staffProfileId),
      });
      if (p) {
        resolvedPractitionerId = p.id;
      }
    }

    // Atomic claim with status check
    const [updated] = await this.db
      .update(replacementOpportunities)
      .set({
        status: 'claimed',
        claimedByStaffProfileId: staffProfileId,
        claimedByPractitionerId: resolvedPractitionerId,
        claimedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(replacementOpportunities.id, opportunityId),
          eq(replacementOpportunities.status, 'open'),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException(
        'Gagal mengambil jadwal pengganti: sesi sudah diambil oleh pihak lain saat transaksi berlangsung',
      );
    }

    void this.dispatchClaimNotifications(opportunityId);

    return this.mapOpportunity(updated);
  }

  async assignOpportunity(
    opportunityId: string,
    staffProfileId: string,
    practitionerId?: string,
    notes?: string,
  ): Promise<ReplacementOpportunityEntity> {
    const [existing] = await this.db
      .select()
      .from(replacementOpportunities)
      .where(eq(replacementOpportunities.id, opportunityId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Peluang pengganti tidak ditemukan');
    }

    if (existing.originalStaffProfileId === staffProfileId) {
      throw new BadRequestException(
        'Staf tidak dapat ditugaskan menggantikan cuti dirinya sendiri',
      );
    }

    if (existing.status === 'completed') {
      throw new ConflictException(
        'Sesi pengganti ini telah selesai dilaksanakan dan tidak dapat diubah',
      );
    }

    if (existing.status === 'cancelled') {
      throw new ConflictException(
        'Sesi pengganti ini telah dibatalkan',
      );
    }

    let resolvedPractitionerId = practitionerId || null;
    if (!resolvedPractitionerId) {
      const p = await this.db.query.practitioners.findFirst({
        where: eq(practitioners.staffProfileId, staffProfileId),
      });
      if (p) {
        resolvedPractitionerId = p.id;
      }
    }

    const [updated] = await this.db
      .update(replacementOpportunities)
      .set({
        status: 'claimed',
        claimedByStaffProfileId: staffProfileId,
        claimedByPractitionerId: resolvedPractitionerId,
        claimedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: notes || existing.notes,
      })
      .where(eq(replacementOpportunities.id, opportunityId))
      .returning();

    if (!updated) {
      throw new NotFoundException('Gagal menugaskan staf pengganti');
    }

    void this.dispatchClaimNotifications(opportunityId);

    const fullRecord = await this.db.query.replacementOpportunities.findFirst({
      where: eq(replacementOpportunities.id, opportunityId),
      with: {
        sessionDef: true,
        originalStaffProfile: true,
        originalPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        claimedByStaffProfile: true,
        claimedByPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        leaveRequest: true,
      },
    });

    return this.mapOpportunity(fullRecord || updated);
  }

  async cancelOpportunity(
    opportunityId: string,
    reason?: string,
  ): Promise<ReplacementOpportunityEntity> {
    const [existing] = await this.db
      .select()
      .from(replacementOpportunities)
      .where(eq(replacementOpportunities.id, opportunityId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Peluang pengganti tidak ditemukan');
    }

    if (existing.status === 'completed') {
      throw new ConflictException(
        'Sesi dinas pengganti yang telah selesai tidak dapat dibatalkan',
      );
    }

    const [updated] = await this.db
      .update(replacementOpportunities)
      .set({
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
        notes: reason
          ? `Dibatalkan admin: ${reason}`
          : existing.notes || 'Dibatalkan admin',
      })
      .where(eq(replacementOpportunities.id, opportunityId))
      .returning();

    if (!updated) {
      throw new NotFoundException('Gagal membatalkan peluang pengganti');
    }

    const fullRecord = await this.db.query.replacementOpportunities.findFirst({
      where: eq(replacementOpportunities.id, opportunityId),
      with: {
        sessionDef: true,
        originalStaffProfile: true,
        originalPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        claimedByStaffProfile: true,
        claimedByPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        leaveRequest: true,
      },
    });

    return this.mapOpportunity(fullRecord || updated);
  }

  private async dispatchNewOpportunityNotification(
    opportunityId: string,
    workDate: string,
  ): Promise<void> {
    try {
      if (!this.notificationGateway) return;
      await this.notificationGateway.dispatch({
        commandId: `rep-new-${opportunityId}-${Date.now()}`,
        sourceDomain: 'replacement',
        target: {
          type: 'role',
          roles: ['staf'],
        },
        category: 'shift',
        content: {
          title: 'Peluang Jadwal Pengganti Baru',
          body: `Tersedia peluang jadwal dinas pengganti untuk tanggal ${workDate}.`,
          actionUrl: '/permission',
          data: {
            opportunityId,
            status: 'open',
            workDate,
          },
        },
        channels: ['in_app'],
        priority: 'normal',
      });
    } catch (err) {
      this.logger.warn(
        `Failed to dispatch new opportunity notification: ${String(err)}`,
      );
    }
  }

  private async dispatchClaimNotifications(
    opportunityId: string,
  ): Promise<void> {
    try {
      if (!this.notificationGateway) return;

      const records = await this.db.query.replacementOpportunities.findMany({
        where: eq(replacementOpportunities.id, opportunityId),
        with: {
          sessionDef: true,
          originalStaffProfile: true,
          claimedByStaffProfile: true,
        },
        limit: 1,
      });

      if (!records || records.length === 0) return;
      const opp = records[0];

      const originalStaffUserId = opp.originalStaffProfile?.userId;
      const originalStaffName = opp.originalStaffProfile?.fullName || '';
      const claimedByStaffUserId = opp.claimedByStaffProfile?.userId;
      const claimedByName = opp.claimedByStaffProfile?.fullName || '';
      const sessionName = formatSessionTitle(opp.sessionDef?.code);
      const dateStr = opp.workDate;

      // 1. Notify Original Staff (whose shift was covered)
      if (originalStaffUserId) {
        await this.notificationGateway.dispatch({
          commandId: `rep-claim-orig-${opp.id}-${Date.now()}`,
          sourceDomain: 'replacement',
          target: {
            type: 'user',
            recipientUserIds: [originalStaffUserId],
          },
          category: 'shift',
          content: {
            title: `Jadwal Pengganti Diambil: ${claimedByName}`,
            body: `${claimedByName} telah bersedia menggantikan jadwal dinas Anda pada ${dateStr} (${sessionName}).`,
            actionUrl: '/permission',
            data: {
              opportunityId: opp.id,
              leaveRequestId: opp.leaveRequestId,
              status: 'claimed',
              claimedByName,
              workDate: dateStr,
            },
          },
          channels: ['in_app', 'push'],
          priority: 'high',
        });
      }

      // 2. Notify Admin
      await this.notificationGateway.dispatch({
        commandId: `rep-claim-admin-${opp.id}-${Date.now()}`,
        sourceDomain: 'replacement',
        target: {
          type: 'role',
          roles: ['admin'],
        },
        category: 'shift',
        content: {
          title: `Peluang Pengganti Terisi: ${claimedByName}`,
          body: `${claimedByName} mengambil jadwal pengganti dari ${originalStaffName} untuk dinas pada ${dateStr} (${sessionName}).`,
          actionUrl: '/dashboard/manajemen-perizinan',
          data: {
            opportunityId: opp.id,
            leaveRequestId: opp.leaveRequestId,
            status: 'claimed',
            claimedByName,
            originalStaffName,
            workDate: dateStr,
          },
        },
        channels: ['in_app'],
        priority: 'normal',
      });

      // 3. Notify Claiming Staff (confirmation)
      if (claimedByStaffUserId) {
        await this.notificationGateway.dispatch({
          commandId: `rep-claim-ack-${opp.id}-${Date.now()}`,
          sourceDomain: 'replacement',
          target: {
            type: 'user',
            recipientUserIds: [claimedByStaffUserId],
          },
          category: 'shift',
          content: {
            title: 'Konfirmasi Jadwal Pengganti Berhasil',
            body: `Anda berhasil mengambil jadwal pengganti dinas ${originalStaffName} pada ${dateStr} (${sessionName}).`,
            actionUrl: '/permission',
            data: {
              opportunityId: opp.id,
              leaveRequestId: opp.leaveRequestId,
              status: 'claimed',
              workDate: dateStr,
            },
          },
          channels: ['in_app', 'push'],
          priority: 'normal',
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to dispatch replacement claim notification: ${String(err)}`,
      );
    }
  }
}

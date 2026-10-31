import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  practitioners,
  sessionDefs,
  staffProfiles,
  replacementOpportunities,
  REPLACEMENT_OPPORTUNITY_STATUS,
} from '../../../../database/schema';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { RealtimeGatewayPort } from '../../../notifications/contracts/realtime-gateway.interface';
import {
  REALTIME_GATEWAY_PORT,
  REALTIME_ROOMS,
} from '../../../notifications/notifications.constants';
import { NOTIFICATION_AUDIENCE } from '../../../../common/constants/notification-audience.constants';
import { ReplacementOpportunityEntity } from '../../domain/entities/replacement-opportunity.entity';
import {
  type ReplacementDateFacetItem,
  type ReplacementFacetsEntity,
  type ReplacementOpportunityFilter,
  type ReplacementRepository,
  type ReplacementStaffFacetItem,
} from '../../domain/repositories/replacement.repository';

@Injectable()
export class ReplacementDrizzleRepository implements ReplacementRepository {
  private readonly logger = new Logger(ReplacementDrizzleRepository.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicTimeService: ClinicTimeService,
    private readonly clinicConfigService: ClinicConfigService,
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: RealtimeGatewayPort,
  ) {}

  /**
   * Pure temporal predicate: Checks whether a replacement opportunity is already expired
   * according to clinic timezone and dynamic leadHours (replacement.auto_expire_hours_before_shift).
   */
  private isOpportunityExpired(
    workDate: string,
    startsAt?: string | null,
    leadHours: number = 2,
  ): boolean {
    if (!startsAt) return false;
    try {
      const timePart = startsAt.length === 5 ? `${startsAt}:00` : startsAt;
      const tz = this.clinicTimeService.getTimezone();
      const shiftStartZdt = Temporal.PlainDateTime.from(
        `${workDate}T${timePart}`,
      ).toZonedDateTime(tz);
      const shiftStartInstant = shiftStartZdt.toInstant();
      const expireInstant = shiftStartInstant.subtract({ hours: leadHours });
      const nowInstant = this.clinicTimeService.nowInstant();
      return Temporal.Instant.compare(nowInstant, expireInstant) >= 0;
    } catch {
      const todayStr = this.clinicTimeService.today();
      if (workDate < todayStr) return true;
      if (workDate === todayStr) {
        const nowTimeStr = this.clinicTimeService.getCurrentTimeString();
        return startsAt <= nowTimeStr;
      }
      return false;
    }
  }

  private mapOpportunity(r: any): ReplacementOpportunityEntity {
    return {
      id: r.id,
      leaveRequestId: r.leaveRequestId,
      sessionId: r.sessionId,
      sessionCode: r.sessionDef?.code || undefined,
      sessionLabel: r.sessionDef?.code,
      startTime: r.sessionDef?.defaultStartsAt || null,
      endTime: r.sessionDef?.defaultEndsAt || null,
      workDate: r.workDate,
      originalStaffProfileId: r.originalStaffProfileId,
      originalPractitionerId: r.originalPractitionerId || null,
      originalStaffName: r.originalStaffProfile?.fullName || undefined,
      originalStaffRole:
        r.originalStaffProfile?.role?.name ||
        r.originalStaffProfile?.positionTitle ||
        null,
      originalStaffAvatarUrl: r.originalStaffProfile?.avatarUrl || null,
      leaveReason: r.leaveRequest?.reason || null,
      claimedByStaffProfileId: r.claimedByStaffProfileId || null,
      claimedByPractitionerId: r.claimedByPractitionerId || null,
      claimedByName: r.claimedByStaffProfile?.fullName || null,
      claimedByRole:
        r.claimedByStaffProfile?.role?.name ||
        r.claimedByPractitioner?.medicalSpecialty?.name ||
        r.claimedByStaffProfile?.positionTitle ||
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
    if (filters?.exactDate) {
      conditions.push(eq(replacementOpportunities.workDate, filters.exactDate));
    } else if (filters?.startDate && filters?.endDate) {
      conditions.push(
        gte(replacementOpportunities.workDate, filters.startDate),
      );
      conditions.push(lte(replacementOpportunities.workDate, filters.endDate));
    } else if (filters?.startDate) {
      conditions.push(
        gte(replacementOpportunities.workDate, filters.startDate),
      );
    } else if (filters?.endDate) {
      conditions.push(lte(replacementOpportunities.workDate, filters.endDate));
    } else if (filters?.date && filters.date !== 'all') {
      conditions.push(gte(replacementOpportunities.workDate, filters.date));
    } else if (
      !filters?.date &&
      filters?.status === REPLACEMENT_OPPORTUNITY_STATUS.OPEN
    ) {
      // Mobile app default for open opportunities: upcoming/today only
      const todayStr = this.clinicTimeService.today();
      conditions.push(gte(replacementOpportunities.workDate, todayStr));
    }

    // Status filtering: If provided and not 'all', filter by exact status
    const statusFilter = filters?.status;
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(replacementOpportunities.status, statusFilter));
    }

    // Staff filter
    if (filters?.staffProfileId) {
      conditions.push(
        eq(
          replacementOpportunities.originalStaffProfileId,
          filters.staffProfileId,
        ),
      );
    }

    const records = await this.db.query.replacementOpportunities.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        sessionDef: true,
        originalStaffProfile: {
          with: { role: true },
        },
        originalPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        claimedByStaffProfile: {
          with: { role: true },
        },
        claimedByPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        leaveRequest: true,
      },
      orderBy: [desc(replacementOpportunities.workDate)],
    });

    const mapped = records.map((r) => this.mapOpportunity(r));

    // When querying open opportunities, dynamically exclude opportunities that have expired
    if (statusFilter === 'open') {
      const leadHours = await this.clinicConfigService
        .getNumber('replacement.auto_expire_hours_before_shift')
        .catch(() => 2);
      return mapped.filter(
        (opp) =>
          !this.isOpportunityExpired(opp.workDate, opp.startTime, leadHours),
      );
    }

    return mapped;
  }

  async findOpenOpportunities(
    date?: string,
  ): Promise<ReplacementOpportunityEntity[]> {
    return this.findOpportunities({
      date,
      status: REPLACEMENT_OPPORTUNITY_STATUS.OPEN,
    });
  }

  async getReplacementFacets(): Promise<ReplacementFacetsEntity> {
    const todayStr = this.clinicTimeService.today();

    const openRecords = await this.db.query.replacementOpportunities.findMany({
      where: and(
        eq(
          replacementOpportunities.status,
          REPLACEMENT_OPPORTUNITY_STATUS.OPEN,
        ),
        gte(replacementOpportunities.workDate, todayStr),
      ),
      with: {
        originalStaffProfile: {
          with: { role: true },
        },
        sessionDef: true,
      },
      orderBy: [asc(replacementOpportunities.workDate)],
    });

    const leadHours = await this.clinicConfigService
      .getNumber('replacement.auto_expire_hours_before_shift')
      .catch(() => 2);

    // Strictly filter out shifts that are already within the leadHours expiration window
    const validOpenRecords = openRecords.filter(
      (r) =>
        !this.isOpportunityExpired(
          r.workDate,
          r.sessionDef?.defaultStartsAt || null,
          leadHours,
        ),
    );

    const staffMap = new Map<
      string,
      {
        staffProfileId: string;
        fullName: string;
        roleCode: string | null;
        avatarUrl: string | null;
        opportunityCount: number;
        earliestDate: string;
        availableDates: Set<string>;
      }
    >();

    const dateMap = new Map<string, number>();

    for (const record of validOpenRecords) {
      const staff = record.originalStaffProfile;
      const wDate = record.workDate;

      dateMap.set(wDate, (dateMap.get(wDate) || 0) + 1);

      if (staff) {
        if (!staffMap.has(staff.id)) {
          staffMap.set(staff.id, {
            staffProfileId: staff.id,
            fullName: staff.fullName,
            roleCode: (staff as any)?.role?.code || null,
            avatarUrl: staff.avatarUrl || null,
            opportunityCount: 0,
            earliestDate: wDate,
            availableDates: new Set<string>(),
          });
        }
        const staffEntry = staffMap.get(staff.id)!;
        staffEntry.opportunityCount++;
        staffEntry.availableDates.add(wDate);
        if (wDate < staffEntry.earliestDate) {
          staffEntry.earliestDate = wDate;
        }
      }
    }

    const distinctStaff: ReplacementStaffFacetItem[] = Array.from(
      staffMap.values(),
    ).map((s) => ({
      ...s,
      availableDates: Array.from(s.availableDates).sort(),
    }));

    const availableDates: ReplacementDateFacetItem[] = Array.from(
      dateMap.entries(),
    )
      .map(([workDate, count]) => ({ workDate, count }))
      .sort((a, b) => a.workDate.localeCompare(b.workDate));

    return {
      distinctStaff,
      availableDates,
      totalOpenOpportunities: validOpenRecords.length,
    };
  }

  async cleanupExpiredOpportunities(leadHours?: number): Promise<number> {
    const effectiveLeadHours =
      leadHours !== undefined
        ? leadHours
        : await this.clinicConfigService
            .getNumber('replacement.auto_expire_hours_before_shift')
            .catch(() => 2);
    const todayStr = this.clinicTimeService.today();

    const candidateRecords =
      await this.db.query.replacementOpportunities.findMany({
        where: and(
          eq(
            replacementOpportunities.status,
            REPLACEMENT_OPPORTUNITY_STATUS.OPEN,
          ),
          lte(replacementOpportunities.workDate, todayStr),
        ),
        with: {
          sessionDef: true,
        },
      });

    const expiredIds: string[] = [];

    for (const rec of candidateRecords) {
      if (
        this.isOpportunityExpired(
          rec.workDate,
          rec.sessionDef?.defaultStartsAt || null,
          effectiveLeadHours,
        )
      ) {
        expiredIds.push(rec.id);
      }
    }

    if (expiredIds.length === 0) {
      return 0;
    }

    const updated = await this.db
      .update(replacementOpportunities)
      .set({
        status: REPLACEMENT_OPPORTUNITY_STATUS.CANCELLED,
        notes: `System: Auto-expired unclaimed opportunity (${effectiveLeadHours}h lead-time before shift start)`,
        updatedAt: new Date().toISOString(),
      })
      .where(inArray(replacementOpportunities.id, expiredIds))
      .returning({ id: replacementOpportunities.id });

    void Promise.allSettled([
      this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'replacement:updated',
        {
          status: REPLACEMENT_OPPORTUNITY_STATUS.CANCELLED,
        },
      ),
    ]);

    this.logger.log(
      `[Cleanup] Automatically expired and cancelled ${updated.length} past replacement opportunities (leadHours=${effectiveLeadHours}).`,
    );

    return updated.length;
  }

  async findByLeaveRequestId(
    leaveRequestId: string,
  ): Promise<ReplacementOpportunityEntity[]> {
    const records = await this.db.query.replacementOpportunities.findMany({
      where: eq(replacementOpportunities.leaveRequestId, leaveRequestId),
      with: {
        sessionDef: true,
        originalStaffProfile: {
          with: { role: true },
        },
        originalPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        claimedByStaffProfile: {
          with: { role: true },
        },
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
        status: REPLACEMENT_OPPORTUNITY_STATUS.OPEN,
        notes: data.notes || null,
      })
      .returning();

    void this.dispatchNewOpportunityNotification(inserted.id, data.workDate);

    void Promise.allSettled([
      this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'replacement:updated',
        {
          opportunityId: inserted.id,
          status: REPLACEMENT_OPPORTUNITY_STATUS.OPEN,
          workDate: data.workDate,
        },
      ),
    ]);

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

    if (existing.status !== REPLACEMENT_OPPORTUNITY_STATUS.OPEN) {
      throw new ConflictException(
        'Peluang pengganti ini sudah diambil oleh rekan lain atau tidak lagi terbuka',
      );
    }

    // Dynamic lead hours expiration validation
    const leadHours = await this.clinicConfigService
      .getNumber('replacement.auto_expire_hours_before_shift')
      .catch(() => 2);

    const sessionDefRecord = await this.db.query.sessionDefs.findFirst({
      where: eq(sessionDefs.id, existing.sessionId),
    });

    if (
      this.isOpportunityExpired(
        existing.workDate,
        sessionDefRecord?.defaultStartsAt || null,
        leadHours,
      )
    ) {
      throw new BadRequestException(
        `Peluang jadwal pengganti telah kedaluwarsa (${leadHours} jam sebelum jadwal dinas dimulai).`,
      );
    }

    const [originalStaff, claimingStaff] = await Promise.all([
      this.db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, existing.originalStaffProfileId),
        with: { role: true, practitioners: true },
      }),
      this.db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, staffProfileId),
        with: { role: true, practitioners: true },
      }),
    ]);

    if (!claimingStaff) {
      throw new NotFoundException('Profil staf pengklaim tidak ditemukan');
    }

    if (claimingStaff.status !== 'active') {
      throw new BadRequestException(
        'Hanya staf berstatus aktif yang dapat mengklaim jadwal pengganti',
      );
    }

    const isOriginalClinical =
      originalStaff?.role?.isClinical ??
      Boolean(
        originalStaff?.practitioners && originalStaff.practitioners.length > 0,
      );
    const isClaimingClinical =
      claimingStaff.role?.isClinical ??
      Boolean(
        claimingStaff.practitioners && claimingStaff.practitioners.length > 0,
      );

    if (isOriginalClinical && !isClaimingClinical) {
      throw new BadRequestException(
        'Sesi dinas klinis hanya dapat digantikan oleh tenaga klinis yang berwenang',
      );
    }

    if (!isOriginalClinical && isClaimingClinical) {
      throw new BadRequestException(
        'Sesi dinas non-klinis hanya dapat digantikan oleh staf non-klinis',
      );
    }

    const resolvedPractitionerId =
      practitionerId || claimingStaff.practitioners?.[0]?.id || null;
    // Atomic claim with status check
    const [updated] = await this.db
      .update(replacementOpportunities)
      .set({
        status: REPLACEMENT_OPPORTUNITY_STATUS.CLAIMED,
        claimedByStaffProfileId: staffProfileId,
        claimedByPractitionerId: resolvedPractitionerId,
        claimedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(replacementOpportunities.id, opportunityId),
          eq(
            replacementOpportunities.status,
            REPLACEMENT_OPPORTUNITY_STATUS.OPEN,
          ),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException(
        'Gagal mengambil jadwal pengganti: sesi sudah diambil oleh pihak lain saat transaksi berlangsung',
      );
    }

    void this.dispatchClaimNotifications(opportunityId);

    void Promise.allSettled([
      this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'replacement:updated',
        {
          opportunityId,
          status: REPLACEMENT_OPPORTUNITY_STATUS.CLAIMED,
          workDate: updated.workDate,
        },
      ),
      this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'doctor_schedule:refresh',
        {
          date: updated.workDate,
        },
      ),
    ]);

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

    if (existing.status === REPLACEMENT_OPPORTUNITY_STATUS.COMPLETED) {
      throw new ConflictException(
        'Sesi pengganti ini telah selesai dilaksanakan dan tidak dapat diubah',
      );
    }

    if (existing.status === REPLACEMENT_OPPORTUNITY_STATUS.CANCELLED) {
      throw new ConflictException('Sesi pengganti ini telah dibatalkan');
    }

    const [originalStaff, targetStaff] = await Promise.all([
      this.db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, existing.originalStaffProfileId),
        with: { role: true, practitioners: true },
      }),
      this.db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.id, staffProfileId),
        with: { role: true, practitioners: true },
      }),
    ]);

    if (!targetStaff) {
      throw new NotFoundException('Profil staf pengganti tidak ditemukan');
    }

    if (targetStaff.status !== 'active') {
      throw new BadRequestException(
        'Hanya staf berstatus aktif yang dapat ditugaskan sebagai pengganti',
      );
    }

    const isOriginalClinical =
      originalStaff?.role?.isClinical ??
      Boolean(
        originalStaff?.practitioners && originalStaff.practitioners.length > 0,
      );
    const isTargetClinical =
      targetStaff.role?.isClinical ??
      Boolean(
        targetStaff.practitioners && targetStaff.practitioners.length > 0,
      );

    if (isOriginalClinical && !isTargetClinical) {
      throw new BadRequestException(
        'Sesi dinas klinis hanya dapat ditugaskan kepada tenaga klinis yang berwenang',
      );
    }

    if (!isOriginalClinical && isTargetClinical) {
      throw new BadRequestException(
        'Sesi dinas non-klinis hanya dapat ditugaskan kepada staf non-klinis',
      );
    }

    const resolvedPractitionerId =
      practitionerId || targetStaff.practitioners?.[0]?.id || null;
    const [updated] = await this.db
      .update(replacementOpportunities)
      .set({
        status: REPLACEMENT_OPPORTUNITY_STATUS.CLAIMED,
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

    void Promise.allSettled([
      this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'replacement:updated',
        {
          opportunityId,
          status: REPLACEMENT_OPPORTUNITY_STATUS.CLAIMED,
          workDate: updated.workDate,
        },
      ),
      this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'doctor_schedule:refresh',
        {
          date: updated.workDate,
        },
      ),
    ]);

    const fullRecord = await this.db.query.replacementOpportunities.findFirst({
      where: eq(replacementOpportunities.id, opportunityId),
      with: {
        sessionDef: true,
        originalStaffProfile: {
          with: { role: true },
        },
        originalPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        claimedByStaffProfile: {
          with: { role: true },
        },
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

    if (existing.status === REPLACEMENT_OPPORTUNITY_STATUS.COMPLETED) {
      throw new ConflictException(
        'Sesi dinas pengganti yang telah selesai tidak dapat dibatalkan',
      );
    }

    const [updated] = await this.db
      .update(replacementOpportunities)
      .set({
        status: REPLACEMENT_OPPORTUNITY_STATUS.CANCELLED,
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

    void Promise.allSettled([
      this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'replacement:updated',
        {
          opportunityId,
          status: REPLACEMENT_OPPORTUNITY_STATUS.CANCELLED,
          workDate: updated.workDate,
        },
      ),
      this.realtimeGateway?.emitToRoom?.(
        REALTIME_ROOMS.clinic,
        'doctor_schedule:refresh',
        {
          date: updated.workDate,
        },
      ),
    ]);

    const fullRecord = await this.db.query.replacementOpportunities.findFirst({
      where: eq(replacementOpportunities.id, opportunityId),
      with: {
        sessionDef: true,
        originalStaffProfile: {
          with: { role: true },
        },
        originalPractitioner: {
          with: {
            medicalSpecialty: true,
          },
        },
        claimedByStaffProfile: {
          with: { role: true },
        },
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
          type: 'broadcast',
        },
        audience: NOTIFICATION_AUDIENCE.INTERNAL,
        category: 'shift',
        content: {
          title: 'Peluang Jadwal Pengganti Baru',
          body: `Tersedia peluang jadwal dinas pengganti untuk tanggal ${workDate}.`,
          actionUrl: '/permission',
          data: {
            opportunityId,
            status: REPLACEMENT_OPPORTUNITY_STATUS.OPEN,
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
      const sessionName = opp.sessionDef?.code;
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
              status: REPLACEMENT_OPPORTUNITY_STATUS.CLAIMED,
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
        audience: NOTIFICATION_AUDIENCE.INTERNAL,
        target: {
          type: 'broadcast',
        },
        category: 'shift',
        content: {
          title: `Peluang Pengganti Terisi: ${claimedByName}`,
          body: `${claimedByName} mengambil jadwal pengganti dari ${originalStaffName} untuk dinas pada ${dateStr} (${sessionName}).`,
          actionUrl: '/admin/manajemen-perizinan',
          data: {
            opportunityId: opp.id,
            leaveRequestId: opp.leaveRequestId,
            status: REPLACEMENT_OPPORTUNITY_STATUS.CLAIMED,
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
              status: REPLACEMENT_OPPORTUNITY_STATUS.CLAIMED,
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

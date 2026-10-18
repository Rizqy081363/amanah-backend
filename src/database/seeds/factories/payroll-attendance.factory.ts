import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  clinicRooms,
  clinicUnits,
  compensationRates,
  doctorAssignments,
  leaveRequestSessions,
  masterDays,
  payrollEntries,
  payrollPeriods,
  practitioners,
  replacementOpportunities,
  serviceCategories,
  sessionDefs,
  staffAttendanceRecords,
  staffLeaveRequests,
  staffProfiles,
  staffRosters,
  users,
} from '../../schema';
import * as schema from '../../schema';
import { PayrollDrizzleRepository } from '../../../modules/payroll/infrastructure/drizzle/payroll.drizzle-repository';

export interface SeededStaffSummary {
  staffId: string;
  fullName: string;
  staffType: 'doctor' | 'midwife' | 'worker';
  practitionerId?: string | null;
}

export class PayrollAttendanceFactory {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  public adminUser: any;
  public activeDoctor: any;
  public activeDoctorPractitioner: any;
  public activeMidwife: any;
  public activeMidwifePractitioner: any;
  public activeWorker: any;
  public activeUnit: any;
  public morningSession: any;
  public afternoonSession: any;
  public defaultRoom: any;
  public defaultServiceCategory: any;
  public currentRates: Map<string, { hourly: number; overtime: number }> = new Map();

  async init(): Promise<void> {
    console.log('[Factory] Discovering database entities dynamically (Zero Hardcoded IDs)...');

    // 1. Fetch active admin user
    this.adminUser = await this.db.query.users.findFirst({
      where: eq(users.email, 'admin@amanah.com'),
    });
    if (!this.adminUser) {
      this.adminUser = await this.db.query.users.findFirst({
        where: eq(users.status, 'active'),
      });
    }

    if (!this.adminUser) {
      throw new Error('[Factory] No active admin/user found in database.');
    }

    // 2. Fetch active clinic units (Prefer Poli Umum or Poli KIA)
    const units = await this.db.query.clinicUnits.findMany({
      where: eq(clinicUnits.isActive, true),
    });
    this.activeUnit =
      units.find((u) => u.code === 'poli_umum') ||
      units.find((u) => u.code === 'poli_kia') ||
      units[0];

    if (!this.activeUnit) {
      throw new Error('[Factory] No active clinic units found in database.');
    }

    // 3. Fetch active sessions (morning & afternoon)
    const sessions = await this.db.query.sessionDefs.findMany({
      where: eq(sessionDefs.isActive, true),
    });
    this.morningSession = sessions.find((s) => s.code === 'morning') || sessions[0];
    this.afternoonSession =
      sessions.find((s) => s.code === 'afternoon') || sessions[1] || sessions[0];

    if (!this.morningSession) {
      throw new Error('[Factory] No active session definitions found in database.');
    }

    // 4. Fetch clinic rooms and service categories
    const rooms = await this.db.query.clinicRooms.findMany({
      where: eq(clinicRooms.isActive, true),
    });
    this.defaultRoom = rooms.find((r) => r.unitId === this.activeUnit.id) || rooms[0];

    const categories = await this.db.query.serviceCategories.findMany({
      where: eq(serviceCategories.isActive, true),
    });
    this.defaultServiceCategory = categories[0];

    // 5. Fetch active staff by category (Doctor, Midwife, Worker)
    const allStaff = await this.db.query.staffProfiles.findMany({
      where: eq(staffProfiles.status, 'active'),
      with: {
        practitioners: true,
      },
    });

    const doctors = allStaff.filter((s) => s.staffType === 'doctor');
    this.activeDoctor =
      doctors.find((d) => d.email === 'dokter@amanah.com' && d.practitioners?.length > 0) ||
      doctors.find((d) => d.email === 'dokter@amanah.com') ||
      doctors.find((d) => d.practitioners && d.practitioners.length > 0) ||
      doctors[0];
    this.activeDoctorPractitioner = this.activeDoctor?.practitioners?.[0] || null;

    const midwives = allStaff.filter((s) => s.staffType === 'midwife');
    this.activeMidwife =
      midwives.find((m) => m.email === 'bidan@amanah.com') ||
      midwives.find((m) => m.practitioners && m.practitioners.length > 0) ||
      midwives[0];
    this.activeMidwifePractitioner = this.activeMidwife?.practitioners?.[0] || null;

    const workers = allStaff.filter((s) => s.staffType === 'worker');
    this.activeWorker =
      workers.find((w) => w.email === 'staff.operasional@amanah.clinic') ||
      workers[0];

    if (!this.activeDoctor || !this.activeWorker) {
      throw new Error(
        `[Factory] Required staff profiles missing (Found Doctors: ${doctors.length}, Workers: ${workers.length})`,
      );
    }

    // 6. Fetch compensation rates
    const rates = await this.db.query.compensationRates.findMany({
      where: eq(compensationRates.isActive, true),
    });
    for (const r of rates) {
      this.currentRates.set(r.category, {
        hourly: Number(r.hourlyRate),
        overtime: Number(r.overtimeHourlyRate),
      });
    }

    console.log(`[Factory] Context successfully initialized:
      - Admin User   : ${this.adminUser.email} (${this.adminUser.id})
      - Clinic Unit  : ${this.activeUnit.name} (${this.activeUnit.code})
      - Doctor Staff : ${this.activeDoctor.fullName} [${this.activeDoctor.staffCode}] (Practitioner: ${this.activeDoctorPractitioner?.id || 'none'})
      - Midwife Staff: ${this.activeMidwife?.fullName || 'N/A'} [${this.activeMidwife?.staffCode || 'N/A'}]
      - Worker Staff : ${this.activeWorker.fullName} [${this.activeWorker.staffCode}]
      - Morning Sess : ${this.morningSession.code} (${this.morningSession.defaultStartsAt} - ${this.morningSession.defaultEndsAt})
      - Rates Loaded : ${this.currentRates.size} active categories`);
  }

  /**
   * Ensures doctor assignments and staff operational rosters exist
   * so that the calculation engine computes base scheduled hours organically.
   */
  async ensureRostersAndAssignments(): Promise<void> {
    console.log('[Factory] Ensuring active doctor assignments & staff rosters...');

    // 1. Doctor assignments (Monday = 1, Wednesday = 3, Friday = 5)
    if (this.activeDoctorPractitioner) {
      const existingAssignments = await this.db
        .select()
        .from(doctorAssignments)
        .where(
          and(
            eq(doctorAssignments.doctorId, this.activeDoctorPractitioner.id),
            eq(doctorAssignments.isActive, true),
          ),
        );

      if (existingAssignments.length === 0) {
        console.log(`  -> Seeding doctor assignments for ${this.activeDoctor.fullName}`);
        const dows = [1, 3, 5]; // Mon, Wed, Fri
        for (const dow of dows) {
          await this.db.insert(doctorAssignments).values({
            doctorId: this.activeDoctorPractitioner.id,
            categoryId: this.defaultServiceCategory?.id || null,
            sessionId: this.morningSession.id,
            dow,
            preferredRoomId: this.defaultRoom?.id || null,
            isActive: true,
          });
        }
        console.log(`  ✓ Created 3 doctor assignments (Mon, Wed, Fri morning sessions)`);
      } else {
        console.log(`  ✓ Doctor already has ${existingAssignments.length} active assignments`);
      }
    }

    // 2. Staff rosters for operational worker (Monday to Friday = 1..5)
    const existingRosters = await this.db
      .select()
      .from(staffRosters)
      .where(
        and(
          eq(staffRosters.staffProfileId, this.activeWorker.id),
          eq(staffRosters.isActive, true),
        ),
      );

    if (existingRosters.length === 0) {
      console.log(`  -> Seeding operational rosters for ${this.activeWorker.fullName}`);
      const dows = [1, 2, 3, 4, 5]; // Mon - Fri
      for (const dow of dows) {
        await this.db.insert(staffRosters).values({
          staffProfileId: this.activeWorker.id,
          sessionId: this.morningSession.id,
          dow,
          isActive: true,
          notes: 'Jadwal operasional reguler dinas pagi',
        });
      }
      console.log(`  ✓ Created 5 operational rosters for ${this.activeWorker.fullName}`);
    } else {
      console.log(`  ✓ Worker already has ${existingRosters.length} active rosters`);
    }
  }

  /**
   * Orchestrates a leave request submission, admin approval,
   * and the automatic creation/claiming of a replacement opportunity.
   */
  async orchestrateLeaveAndReplacement(
    workDate: string,
  ): Promise<{ leaveId: string; opportunityId: string }> {
    console.log(`[Factory] Orchestrating leave request & replacement opportunity on ${workDate}...`);

    // Clean up existing leave for this staff on this date if present
    const existingLeaves = await this.db
      .select()
      .from(staffLeaveRequests)
      .where(
        and(
          eq(staffLeaveRequests.staffProfileId, this.activeDoctor.id),
          eq(staffLeaveRequests.startDate, workDate),
        ),
      );

    for (const l of existingLeaves) {
      await this.db
        .delete(replacementOpportunities)
        .where(eq(replacementOpportunities.leaveRequestId, l.id));
      await this.db
        .delete(leaveRequestSessions)
        .where(eq(leaveRequestSessions.leaveRequestId, l.id));
      await this.db
        .delete(staffLeaveRequests)
        .where(eq(staffLeaveRequests.id, l.id));
    }

    // 1. Create approved leave request
    const [createdLeave] = await this.db
      .insert(staffLeaveRequests)
      .values({
        staffProfileId: this.activeDoctor.id,
        practitionerId: this.activeDoctorPractitioner?.id || null,
        requestType: 'annual_leave',
        startDate: workDate,
        endDate: workDate,
        durationDays: 1,
        reason: 'Keperluan riset medis dan dinas luar kota',
        status: 'approved',
        scope: 'session',
        decisionSource: 'admin',
        reviewedBy: this.adminUser.id,
        reviewedAt: new Date().toISOString(),
        reviewerNotes: 'Disetujui oleh Kepala HRD & Direktur Medis',
      })
      .returning();

    // 2. Link leave request session
    await this.db.insert(leaveRequestSessions).values({
      leaveRequestId: createdLeave.id,
      sessionId: this.morningSession.id,
      workDate,
    });

    // 3. Create replacement opportunity and mark as claimed by peer (Midwife or Worker)
    const claimedStaff = this.activeMidwife || this.activeWorker;
    const claimedPractitioner = this.activeMidwifePractitioner?.id || null;

    const [createdOpportunity] = await this.db
      .insert(replacementOpportunities)
      .values({
        leaveRequestId: createdLeave.id,
        sessionId: this.morningSession.id,
        workDate,
        originalStaffProfileId: this.activeDoctor.id,
        originalPractitionerId: this.activeDoctorPractitioner?.id || null,
        claimedByStaffProfileId: claimedStaff.id,
        claimedByPractitionerId: claimedPractitioner,
        claimedAt: new Date().toISOString(),
        status: 'claimed',
        notes: `Dinas pengganti oleh ${claimedStaff.fullName} atas izin ${this.activeDoctor.fullName}`,
      })
      .returning();

    console.log(`  ✓ Created approved leave request ID: ${createdLeave.id}`);
    console.log(`  ✓ Created & claimed replacement opportunity ID: ${createdOpportunity.id} (Claimed by: ${claimedStaff.fullName})`);

    return {
      leaveId: createdLeave.id,
      opportunityId: createdOpportunity.id,
    };
  }

  /**
   * Orchestrates realistic attendance records (present, late, replacement)
   * with validated duration hours so payroll overtime additions are computed.
   */
  async orchestrateAttendanceRecords(
    dates: {
      regularDate: string;
      lateDate: string;
      replacementDate: string;
      opportunityId?: string;
    },
  ): Promise<void> {
    console.log('[Factory] Orchestrating attendance records across multiple scenarios...');

    const claimedStaff = this.activeMidwife || this.activeWorker;

    // Remove existing test records for these dates to avoid duplicates
    await this.db
      .delete(staffAttendanceRecords)
      .where(
        and(
          inArray(staffAttendanceRecords.attendanceDate, [
            dates.regularDate,
            dates.lateDate,
            dates.replacementDate,
          ]),
          inArray(staffAttendanceRecords.staffProfileId, [
            this.activeDoctor.id,
            this.activeWorker.id,
            claimedStaff.id,
          ]),
        ),
      );

    // Scenario 1: Doctor Regular On-Time Check-In & Check-Out (8.00 hours)
    await this.db.insert(staffAttendanceRecords).values({
      staffProfileId: this.activeDoctor.id,
      sessionId: this.morningSession.id,
      unitId: this.activeUnit.id,
      roomId: this.defaultRoom?.id || null,
      attendanceDate: dates.regularDate,
      shift: 'morning',
      status: 'present',
      expectedCheckInAt: `${dates.regularDate}T08:00:00+07:00`,
      checkInAt: `${dates.regularDate}T07:55:00+07:00`,
      checkOutAt: `${dates.regularDate}T16:00:00+07:00`,
      lateMinutes: 0,
      validatedDurationHours: '8.00',
      isReplacement: false,
      recordedMethod: 'qr_scan',
      notes: 'Presensi QR reguler tepat waktu',
    });
    console.log(`  ✓ Record 1: Doctor on-time attendance on ${dates.regularDate} (8.00 hrs)`);

    // Scenario 2: Worker Late Check-In & Check-Out (7.50 hours, 20 mins late)
    await this.db.insert(staffAttendanceRecords).values({
      staffProfileId: this.activeWorker.id,
      sessionId: this.morningSession.id,
      unitId: this.activeUnit.id,
      roomId: this.defaultRoom?.id || null,
      attendanceDate: dates.lateDate,
      shift: 'morning',
      status: 'late',
      expectedCheckInAt: `${dates.lateDate}T08:00:00+07:00`,
      checkInAt: `${dates.lateDate}T08:20:00+07:00`,
      checkOutAt: `${dates.lateDate}T16:00:00+07:00`,
      lateMinutes: 20,
      validatedDurationHours: '7.50',
      isReplacement: false,
      recordedMethod: 'manual_pin',
      notes: 'Presensi kode manual terlambat 20 menit',
    });
    console.log(`  ✓ Record 2: Worker late attendance on ${dates.lateDate} (7.50 hrs, 20m late)`);

    // Scenario 3: Replacement Shift Check-In & Check-Out (6.00 hours, isReplacement: true)
    await this.db.insert(staffAttendanceRecords).values({
      staffProfileId: claimedStaff.id,
      sessionId: this.morningSession.id,
      unitId: this.activeUnit.id,
      roomId: this.defaultRoom?.id || null,
      attendanceDate: dates.replacementDate,
      shift: 'morning',
      status: 'present',
      expectedCheckInAt: `${dates.replacementDate}T08:00:00+07:00`,
      checkInAt: `${dates.replacementDate}T07:50:00+07:00`,
      checkOutAt: `${dates.replacementDate}T14:00:00+07:00`,
      lateMinutes: 0,
      validatedDurationHours: '6.00',
      isReplacement: true,
      replacementOpportunityId: dates.opportunityId || null,
      recordedMethod: 'qr_scan',
      notes: `Dinas pengganti jadwal cuti dokter (6.00 jam lembur/pengganti)`,
    });

    if (dates.opportunityId) {
      await this.db
        .update(replacementOpportunities)
        .set({ status: 'completed', updatedAt: new Date().toISOString() })
        .where(eq(replacementOpportunities.id, dates.opportunityId));
    }
    console.log(`  ✓ Record 3: Replacement attendance completed on ${dates.replacementDate} (6.00 hrs) by ${claimedStaff.fullName}`);
  }

  /**
   * Invokes the real PayrollDrizzleRepository calculation engine
   * rather than fabricating synthetic totals.
   */
  async orchestratePayrollCalculation(
    periodStart: string,
    periodEnd: string,
    periodName?: string,
  ): Promise<any> {
    console.log(`[Factory] Invoking Payroll Calculation Engine for period ${periodStart} to ${periodEnd}...`);
    const payrollRepo = new PayrollDrizzleRepository(this.db as any);

    const name = periodName || `Payroll Periode ${periodStart} - ${periodEnd}`;
    const result = await payrollRepo.calculatePeriod(
      periodStart,
      periodEnd,
      name,
      this.adminUser.id,
    );

    return result;
  }
}

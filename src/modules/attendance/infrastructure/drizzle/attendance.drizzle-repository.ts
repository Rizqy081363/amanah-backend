import { Injectable } from '@nestjs/common';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import { QrSessionEntity } from '../../domain/entities/qr-session.entity';
import {
  AttendanceExportCandidate,
  AttendanceHistoryResultDto,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceBffStatsDrizzleRepo } from './repositories/attendance-bff-stats.drizzle-repo';
import { AttendanceQrDrizzleRepo } from './repositories/attendance-qr.drizzle-repo';
import { AttendanceRecordsDrizzleRepo } from './repositories/attendance-records.drizzle-repo';
import { AttendanceRosterLookupDrizzleRepo } from './repositories/attendance-roster-lookup.drizzle-repo';

@Injectable()
export class AttendanceDrizzleRepository implements AttendanceRepository {
  constructor(
    private readonly recordsRepo: AttendanceRecordsDrizzleRepo,
    private readonly qrRepo: AttendanceQrDrizzleRepo,
    private readonly rosterLookupRepo: AttendanceRosterLookupDrizzleRepo,
    private readonly bffStatsRepo: AttendanceBffStatsDrizzleRepo,
  ) {}

  // --- Records Operations ---

  async saveAttendanceRecord(data: {
    staffProfileId: string;
    attendanceDate: string;
    shift: string;
    status: string;
    checkInAt: string;
    lateMinutes?: number | null;
    recordedMethod: string;
    sessionId?: string | null;
    qrSessionId?: string | null;
    isReplacement: boolean;
    replacementOpportunityId?: string | null;
    recordedBy?: string | null;
    notes?: string | null;
  }): Promise<AttendanceEntity> {
    return this.recordsRepo.saveAttendanceRecord(data);
  }

  async updateAttendanceRecord(
    id: string,
    data: {
      checkOutAt?: string | null;
      validatedDurationHours?: string | null;
      notes?: string | null;
      isEarlyDeparture?: boolean;
      updatedAt?: string;
    },
  ): Promise<AttendanceEntity> {
    return this.recordsRepo.updateAttendanceRecord(id, data);
  }

  async findStaffAttendanceForDate(
    staffId: string,
    attendanceDate: string,
  ): Promise<AttendanceEntity | null> {
    return this.recordsRepo.findStaffAttendanceForDate(staffId, attendanceDate);
  }

  async findStaffAttendanceForDateAndShift(
    staffId: string,
    attendanceDate: string,
    shift: string,
  ): Promise<AttendanceEntity | null> {
    return this.recordsRepo.findStaffAttendanceForDateAndShift(
      staffId,
      attendanceDate,
      shift,
    );
  }

  async findOpenAttendanceRecord(
    staffId: string,
    attendanceDate: string,
  ): Promise<AttendanceEntity | null> {
    return this.recordsRepo.findOpenAttendanceRecord(staffId, attendanceDate);
  }

  async findByStaffId(
    staffId: string,
    limit?: number,
  ): Promise<AttendanceEntity[]> {
    return this.recordsRepo.findByStaffId(staffId, limit);
  }

  async findHistoryWithSummaryByStaffId(
    staffId: string,
    limit?: number,
  ): Promise<AttendanceHistoryResultDto> {
    return this.recordsRepo.findHistoryWithSummaryByStaffId(staffId, limit);
  }

  async findDailyWithStaff(date: string): Promise<any[]> {
    return this.recordsRepo.findDailyWithStaff(date);
  }

  // --- QR Session Operations ---

  async createQrSession(data: {
    codeHash: string;
    sessionType: 'location_check_in' | 'staff_identity';
    shift: string;
    rotationSeconds: number;
    context: string;
    validFrom: string;
    validUntil: string;
    createdBy?: string | null;
  }): Promise<QrSessionEntity> {
    return this.qrRepo.createQrSession(data);
  }

  async findActiveQrSession(
    sessionType?: string,
  ): Promise<QrSessionEntity | null> {
    return this.qrRepo.findActiveQrSession(sessionType);
  }

  async findQrSessionByToken(token: string): Promise<QrSessionEntity | null> {
    return this.qrRepo.findQrSessionByToken(token);
  }

  // --- Roster, Schedule & Resolution Operations ---

  async findApprovedLeave(staffId: string, dateStr: string): Promise<boolean> {
    return this.rosterLookupRepo.findApprovedLeave(staffId, dateStr);
  }

  async findClaimedReplacement(
    staffId: string,
    dateStr: string,
  ): Promise<{ id: string } | null> {
    return this.rosterLookupRepo.findClaimedReplacement(staffId, dateStr);
  }

  async markReplacementCompleted(opportunityId: string): Promise<void> {
    return this.rosterLookupRepo.markReplacementCompleted(opportunityId);
  }

  async findStaffRostersForDow(
    staffId: string,
    dow: number,
  ): Promise<Array<{ id: string; sessionId: string }>> {
    return this.rosterLookupRepo.findStaffRostersForDow(staffId, dow);
  }

  async hasCustomStaffRoster(staffId: string): Promise<boolean> {
    return this.rosterLookupRepo.hasCustomStaffRoster(staffId);
  }

  async hasCustomDoctorRoster(staffId: string): Promise<boolean> {
    return this.rosterLookupRepo.hasCustomDoctorRoster(staffId);
  }

  async findInactiveDoctorAssignmentSessionIds(staffId: string, dow: number) {
    return this.rosterLookupRepo.findInactiveDoctorAssignmentSessionIds(
      staffId,
      dow,
    );
  }

  async findStaffRostersForDowDetailed(staffId: string, dow: number) {
    return this.rosterLookupRepo.findStaffRostersForDowDetailed(staffId, dow);
  }

  async findDoctorAssignmentsForDowDetailed(staffId: string, dow: number) {
    return this.rosterLookupRepo.findDoctorAssignmentsForDowDetailed(
      staffId,
      dow,
    );
  }

  async findDoctorShiftExceptions(staffId: string, dateStr: string) {
    return this.rosterLookupRepo.findDoctorShiftExceptions(staffId, dateStr);
  }

  async findClinicWeeklyTemplateForDow(dow: number) {
    return this.rosterLookupRepo.findClinicWeeklyTemplateForDow(dow);
  }

  async findClaimedReplacementSession(opportunityId: string, dow: number) {
    return this.rosterLookupRepo.findClaimedReplacementSession(
      opportunityId,
      dow,
    );
  }

  async findDoctorAssignmentsForDow(
    staffId: string,
    dow: number,
  ): Promise<Array<{ id: string; sessionId: string }>> {
    return this.rosterLookupRepo.findDoctorAssignmentsForDow(staffId, dow);
  }

  async findScheduledStaffCountByDow(dow: number): Promise<number> {
    return this.rosterLookupRepo.findScheduledStaffCountByDow(dow);
  }

  async resolveStaffByIdOrCode(query: string) {
    return this.rosterLookupRepo.resolveStaffByIdOrCode(query);
  }

  async resolveSessionDefByTime(
    hourOrTime: number | string | Date,
    windowMinutesBefore?: number,
  ) {
    return this.rosterLookupRepo.resolveSessionDefByTime(
      hourOrTime,
      windowMinutesBefore,
    );
  }

  async resolveSessionDefByCode(sessionCode: string) {
    return this.rosterLookupRepo.resolveSessionDefByCode(sessionCode);
  }

  async resolveSessionDefById(sessionId: string) {
    return this.rosterLookupRepo.resolveSessionDefById(sessionId);
  }

  // --- BFF Stats & Analytics Operations ---

  async getMasterDays() {
    return this.bffStatsRepo.getMasterDays();
  }

  async findWeeklyAttendanceCounts(startDate: string, endDate: string) {
    return this.bffStatsRepo.findWeeklyAttendanceCounts(startDate, endDate);
  }

  async getAvailableFilterOptions() {
    return this.bffStatsRepo.getAvailableFilterOptions();
  }

  async getAllShiftLabelsMap(): Promise<Map<string, string>> {
    return this.bffStatsRepo.getAllShiftLabelsMap();
  }

  async getExportCandidates(
    startDate: string,
    endDate: string,
  ): Promise<AttendanceExportCandidate[]> {
    return this.bffStatsRepo.getExportCandidates(startDate, endDate);
  }
}

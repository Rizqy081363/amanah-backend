import { Module } from '@nestjs/common';
import { SchedulerModule } from '../../common/scheduler';
import { PayrollModule } from '../payroll/payroll.module';
import { ShiftEndAttendanceScheduler } from './application/schedulers/shift-end-attendance.scheduler';
import { AttendanceMetricsCalculator } from './application/services/attendance-metrics.calculator';
import { AttendanceNotificationService } from './application/services/attendance-notification.service';
import {
  CheckOutAttendanceUseCase,
  GetAttendanceExportCandidatesUseCase,
  GetDailyAttendanceBffUseCase,
  GetMyAttendanceHistoryUseCase,
  GetStaffAttendanceMilestonesUseCase,
  ManualAttendanceUseCase,
  ProcessShiftEndAbsenceUseCase,
  ReconcileAttendanceOvertimeUseCase,
  RotateQrSessionUseCase,
  ScanAttendanceUseCase,
} from './application/use-cases';
import { ATTENDANCE_REPOSITORY } from './domain/repositories/attendance.repository';
import { AttendanceCredentialValidator } from './domain/services/attendance-credential.validator';
import { AttendanceEligibilityService } from './domain/services/attendance-eligibility.service';
import { AttendanceRosterCandidateResolver } from './domain/services/attendance-roster-candidate.resolver';
import { AttendanceTimingService } from './domain/services/attendance-timing.service';
import { CheckoutTicketService } from './domain/services/checkout-ticket.service';
import { AttendanceDrizzleRepository } from './infrastructure/drizzle/attendance.drizzle-repository';
import { AttendanceBffStatsDrizzleRepo } from './infrastructure/drizzle/repositories/attendance-bff-stats.drizzle-repo';
import { AttendanceQrDrizzleRepo } from './infrastructure/drizzle/repositories/attendance-qr.drizzle-repo';
import { AttendanceRecordsDrizzleRepo } from './infrastructure/drizzle/repositories/attendance-records.drizzle-repo';
import { AttendanceRosterLookupDrizzleRepo } from './infrastructure/drizzle/repositories/attendance-roster-lookup.drizzle-repo';
import { AttendanceController } from './presentation/attendance.controller';

@Module({
  imports: [PayrollModule, SchedulerModule],
  controllers: [AttendanceController],
  providers: [
    // Sub-repositories
    AttendanceRecordsDrizzleRepo,
    AttendanceQrDrizzleRepo,
    AttendanceRosterLookupDrizzleRepo,
    AttendanceBffStatsDrizzleRepo,
    // Repository Facade
    {
      provide: ATTENDANCE_REPOSITORY,
      useClass: AttendanceDrizzleRepository,
    },
    // Domain Services
    AttendanceCredentialValidator,
    AttendanceRosterCandidateResolver,
    AttendanceEligibilityService,
    AttendanceTimingService,
    CheckoutTicketService,
    // Application Services
    AttendanceMetricsCalculator,
    AttendanceNotificationService,
    // Use Cases
    ScanAttendanceUseCase,
    ManualAttendanceUseCase,
    CheckOutAttendanceUseCase,
    RotateQrSessionUseCase,
    GetMyAttendanceHistoryUseCase,
    GetDailyAttendanceBffUseCase,
    GetAttendanceExportCandidatesUseCase,
    GetStaffAttendanceMilestonesUseCase,
    ProcessShiftEndAbsenceUseCase,
    ReconcileAttendanceOvertimeUseCase,
    // Schedulers
    ShiftEndAttendanceScheduler,
  ],
  exports: [
    ATTENDANCE_REPOSITORY,
    CheckoutTicketService,
    ScanAttendanceUseCase,
    ManualAttendanceUseCase,
    CheckOutAttendanceUseCase,
    RotateQrSessionUseCase,
    GetMyAttendanceHistoryUseCase,
    GetDailyAttendanceBffUseCase,
    GetAttendanceExportCandidatesUseCase,
    GetStaffAttendanceMilestonesUseCase,
    ProcessShiftEndAbsenceUseCase,
    ReconcileAttendanceOvertimeUseCase,
  ],
})
export class AttendanceModule {}

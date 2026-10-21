import { Module } from '@nestjs/common';
import { PayrollModule } from '../payroll/payroll.module';
import { AttendanceMetricsCalculator } from './application/services/attendance-metrics.calculator';
import { AttendanceNotificationService } from './application/services/attendance-notification.service';
import { CheckOutAttendanceUseCase } from './application/use-cases/checkout-attendance.use-case';
import { GetDailyAttendanceBffUseCase } from './application/use-cases/get-daily-attendance-bff.use-case';
import { ManualAttendanceUseCase } from './application/use-cases/manual-attendance.use-case';
import { RotateQrSessionUseCase } from './application/use-cases/rotate-qr-session.use-case';
import { ScanAttendanceUseCase } from './application/use-cases/scan-attendance.use-case';
import { ATTENDANCE_REPOSITORY } from './domain/repositories/attendance.repository';
import { AttendanceEligibilityService } from './domain/services/attendance-eligibility.service';
import { AttendanceTimingService } from './domain/services/attendance-timing.service';
import { AttendanceDrizzleRepository } from './infrastructure/drizzle/attendance.drizzle-repository';
import { AttendanceController } from './presentation/attendance.controller';

@Module({
  imports: [PayrollModule],
  controllers: [AttendanceController],
  providers: [
    // Repository
    {
      provide: ATTENDANCE_REPOSITORY,
      useClass: AttendanceDrizzleRepository,
    },
    // Domain Services
    AttendanceEligibilityService,
    AttendanceTimingService,
    // Application Services
    AttendanceMetricsCalculator,
    AttendanceNotificationService,
    // Use Cases
    ScanAttendanceUseCase,
    ManualAttendanceUseCase,
    CheckOutAttendanceUseCase,
    RotateQrSessionUseCase,
    GetDailyAttendanceBffUseCase,
  ],
  exports: [
    ATTENDANCE_REPOSITORY,
    ScanAttendanceUseCase,
    ManualAttendanceUseCase,
    CheckOutAttendanceUseCase,
    RotateQrSessionUseCase,
    GetDailyAttendanceBffUseCase,
  ],
})
export class AttendanceModule {}

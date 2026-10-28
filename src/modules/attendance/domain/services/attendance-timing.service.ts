import { Injectable } from '@nestjs/common';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { AttendanceStatus, normalizeStatus } from '../constants/attendance.constants';

@Injectable()
export class AttendanceTimingService {
  constructor(
    private readonly clinicConfig: ClinicConfigService,
  ) {}

  async calculateTimingStatus(params: {
    checkInTime: Date;
    scheduledStartTime?: string | null;
    explicitStatus?: string;
  }): Promise<{ status: AttendanceStatus; lateMinutes: number }> {
    const { checkInTime, scheduledStartTime, explicitStatus } = params;

    if (explicitStatus) {
      const explicit = normalizeStatus(explicitStatus);
      if (explicit) {
        return { status: explicit, lateMinutes: 0 };
      }
    }

    const lateThresholdMinutes =
      (await this.clinicConfig.getAttendanceConfig()).lateToleranceMinutes;

    let calculatedStatus: AttendanceStatus = 'present';
    let lateMinutes = 0;

    if (scheduledStartTime) {
      const [startH, startM] = scheduledStartTime.split(':').map(Number);
      const scheduledDate = new Date(checkInTime);
      scheduledDate.setHours(startH, startM, 0, 0);

      const diffMs = checkInTime.getTime() - scheduledDate.getTime();
      const diffMinutes = Math.round(diffMs / (1000 * 60));

      if (diffMinutes > lateThresholdMinutes) {
        calculatedStatus = 'late';
        lateMinutes = diffMinutes;
      }
    }

    return { status: calculatedStatus, lateMinutes };
  }

  async evaluateCheckOutTiming(params: {
    checkInTime: Date;
    checkOutTime: Date;
    scheduledEndTime?: string | null;
    scheduledShiftDurationHours?: number;
  }): Promise<{
    isEarlyDeparture: boolean;
    validatedDurationHours: number;
    requiresNotes: boolean;
    earlyMinutes: number;
  }> {
    const {
      checkInTime,
      checkOutTime,
      scheduledEndTime,
      scheduledShiftDurationHours = 6,
    } = params;

    const config = await this.clinicConfig.getAttendanceConfig();
    const windowMinutesBefore = config.checkOutWindowMinutesBefore ?? 30;
    const minBillableShiftMinutes = config.minBillableShiftMinutes ?? 30;
    const roundingIncrementMinutes = config.roundingIncrementMinutes ?? 15;

    let isEarlyDeparture = false;
    let earlyMinutes = 0;
    let validatedDurationHours = scheduledShiftDurationHours;

    const elapsedMs = Math.max(0, checkOutTime.getTime() - checkInTime.getTime());
    const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

    // Standardized billable duration calculation
    let calculatedBillableHours = 0;
    if (elapsedMinutes >= minBillableShiftMinutes) {
      const roundedMinutes =
        roundingIncrementMinutes > 0
          ? Math.floor(elapsedMinutes / roundingIncrementMinutes) * roundingIncrementMinutes
          : elapsedMinutes;
      calculatedBillableHours = Number((roundedMinutes / 60).toFixed(2));
    }

    if (scheduledEndTime) {
      let [endH, endM] = scheduledEndTime.split(':').map(Number);
      if (endH === 24) endH = 0;

      const scheduledEndDate = new Date(checkOutTime);
      scheduledEndDate.setHours(endH, endM || 0, 0, 0);

      if (endH === 0 && checkInTime.getHours() >= 12) {
        scheduledEndDate.setDate(scheduledEndDate.getDate() + 1);
      }

      const windowStartDate = new Date(
        scheduledEndDate.getTime() - windowMinutesBefore * 60 * 1000,
      );

      if (checkOutTime.getTime() < windowStartDate.getTime()) {
        isEarlyDeparture = true;
        earlyMinutes = Math.round(
          (scheduledEndDate.getTime() - checkOutTime.getTime()) / (1000 * 60),
        );
        validatedDurationHours = Math.min(
          scheduledShiftDurationHours,
          calculatedBillableHours,
        );
      } else {
        // Within or after normal window: Fair Credit Rounding grants full scheduled hours
        // ONLY if the employee actually served the full shift (not arriving 5 minutes before checkout)
        const isFullShiftSatisfied =
          elapsedMinutes >=
          Math.max(
            minBillableShiftMinutes,
            scheduledShiftDurationHours * 60 - windowMinutesBefore,
          );
        validatedDurationHours = isFullShiftSatisfied
          ? scheduledShiftDurationHours
          : Math.min(scheduledShiftDurationHours, calculatedBillableHours);
      }
    } else {
      const thresholdMinutes =
        scheduledShiftDurationHours * 60 - windowMinutesBefore;

      if (elapsedMinutes < thresholdMinutes) {
        isEarlyDeparture = true;
        earlyMinutes = Math.round(thresholdMinutes - elapsedMinutes);
        validatedDurationHours = Math.min(
          scheduledShiftDurationHours,
          calculatedBillableHours,
        );
      } else {
        validatedDurationHours = scheduledShiftDurationHours;
      }
    }

    return {
      isEarlyDeparture,
      validatedDurationHours,
      requiresNotes:
        isEarlyDeparture && (config.earlyCheckoutRequiresNotes ?? true),
      earlyMinutes,
    };
  }
}

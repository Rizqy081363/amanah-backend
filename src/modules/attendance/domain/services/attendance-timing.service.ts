import { Injectable, Optional } from '@nestjs/common';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { AttendanceStatus, normalizeStatus } from '../constants/attendance.constants';

@Injectable()
export class AttendanceTimingService {
  constructor(
    @Optional()
    private readonly clinicConfig?: ClinicConfigService,
  ) {}

  async calculateTimingStatus(params: {
    checkInTime: Date;
    scheduledStartTime?: string | null;
    explicitStatus?: string;
  }): Promise<{ status: AttendanceStatus; lateMinutes: number }> {
    const { checkInTime, scheduledStartTime, explicitStatus } = params;

    if (explicitStatus) {
      const explicit = normalizeStatus(explicitStatus);
      return { status: explicit, lateMinutes: 0 };
    }

    let lateThresholdMinutes = 15;
    if (this.clinicConfig) {
      try {
        const attConfig = await this.clinicConfig.getAttendanceConfig();
        lateThresholdMinutes = Math.min(
          30,
          Math.floor(attConfig.checkInWindowMinutesAfter / 2),
        );
      } catch {
        lateThresholdMinutes = 15;
      }
    }

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
}

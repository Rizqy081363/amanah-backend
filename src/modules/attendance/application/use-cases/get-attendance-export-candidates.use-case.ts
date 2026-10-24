import { Inject, Injectable } from '@nestjs/common';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceExportCandidate,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';

export interface GetAttendanceExportCandidatesResult {
  candidates: AttendanceExportCandidate[];
  period: {
    month: string;
    startDate: string;
    endDate: string;
  };
}

@Injectable()
export class GetAttendanceExportCandidatesUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
  ) {}

  async execute(monthParam?: string): Promise<GetAttendanceExportCandidatesResult> {
    let year: number;
    let monthNum: number;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const parts = monthParam.split('-');
      year = parseInt(parts[0], 10);
      monthNum = parseInt(parts[1], 10);
    } else {
      const now = new Date();
      year = now.getFullYear();
      monthNum = now.getMonth() + 1;
    }

    const mm = String(monthNum).padStart(2, '0');
    const lastDay = new Date(year, monthNum, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, '0');

    const startDate = `${year}-${mm}-01`;
    const endDate = `${year}-${mm}-${lastDayStr}`;
    const periodMonth = `${year}-${mm}`;

    const candidates = await this.repo.getExportCandidates(startDate, endDate);

    return {
      candidates,
      period: {
        month: periodMonth,
        startDate,
        endDate,
      },
    };
  }
}

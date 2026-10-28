import { Inject, Injectable } from '@nestjs/common';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceHistoryResultDto,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';

@Injectable()
export class GetMyAttendanceHistoryUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
  ) {}

  async execute(
    staffId: string,
    limit?: number,
  ): Promise<AttendanceHistoryResultDto> {
    return this.repo.findHistoryWithSummaryByStaffId(staffId, limit);
  }
}

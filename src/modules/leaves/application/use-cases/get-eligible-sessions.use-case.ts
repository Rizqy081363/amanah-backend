import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthenticatedUser,
  isStaffUser,
} from '../../../../common/auth';
import { DomainForbiddenException } from '../../../../common/exceptions/domain.exceptions';
import {
  LEAVE_REPOSITORY,
  type LeaveRepository,
} from '../../domain/repositories/leave.repository';

@Injectable()
export class GetEligibleSessionsUseCase {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  async execute(
    date: string | undefined,
    user: AuthenticatedUser,
  ): Promise<any[]> {
    if (!isStaffUser(user)) {
      throw new DomainForbiddenException('User bukan staf terdaftar');
    }

    const targetDate = date?.trim() || new Date().toISOString().split('T')[0];
    return this.leaveRepo.getEligibleSessions(user.staff.id, targetDate);
  }
}

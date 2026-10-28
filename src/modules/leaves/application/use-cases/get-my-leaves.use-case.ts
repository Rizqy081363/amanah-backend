import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthenticatedUser,
  isStaffUser,
} from '../../../../common/auth';
import { DomainForbiddenException } from '../../../../common/exceptions/domain.exceptions';
import type { LeaveEntity } from '../../domain/entities/leave.entity';
import {
  LEAVE_REPOSITORY,
  type LeaveRepository,
} from '../../domain/repositories/leave.repository';

@Injectable()
export class GetMyLeavesUseCase {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  async execute(user: AuthenticatedUser): Promise<LeaveEntity[]> {
    if (!isStaffUser(user)) {
      throw new DomainForbiddenException('User bukan staf terdaftar');
    }

    return this.leaveRepo.findByStaffId(user.staff.id);
  }
}

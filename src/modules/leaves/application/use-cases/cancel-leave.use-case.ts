import { Inject, Injectable } from '@nestjs/common';
import {
  type AuthenticatedUser,
  isStaffUser,
} from '../../../../common/auth';
import {
  DomainForbiddenException,
  EntityNotFoundException,
} from '../../../../common/exceptions/domain.exceptions';
import type { LeaveEntity } from '../../domain/entities/leave.entity';
import {
  LEAVE_REPOSITORY,
  type LeaveRepository,
} from '../../domain/repositories/leave.repository';

@Injectable()
export class CancelLeaveUseCase {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  async execute(id: string, user: AuthenticatedUser): Promise<LeaveEntity> {
    if (!isStaffUser(user)) {
      throw new DomainForbiddenException('User bukan staf terdaftar');
    }

    const updated = await this.leaveRepo.cancel(id, user.staff.id);
    if (!updated) {
      throw new EntityNotFoundException('Leave', id);
    }

    return updated;
  }
}

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
import type { RequestLeaveInput } from '../../presentation/schemas/request-leave.schema';

@Injectable()
export class RequestLeaveUseCase {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  async execute(
    input: RequestLeaveInput,
    user: AuthenticatedUser,
  ): Promise<LeaveEntity> {
    if (!isStaffUser(user)) {
      throw new DomainForbiddenException('User bukan staf terdaftar');
    }

    return this.leaveRepo.create({
      staffId: user.staff.id,
      practitionerId: user.staff.practitionerId ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason,
      type: input.type,
      scope: input.scope,
      sessionIds: input.sessionIds,
      substituteStaffId: input.substituteStaffId,
      documentUrl: input.documentUrl,
    });
  }
}

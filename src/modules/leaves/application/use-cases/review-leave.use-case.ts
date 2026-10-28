import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../common/auth';
import { EntityNotFoundException } from '../../../../common/exceptions/domain.exceptions';
import type { LeaveEntity } from '../../domain/entities/leave.entity';
import {
  LEAVE_REPOSITORY,
  type LeaveRepository,
} from '../../domain/repositories/leave.repository';
import type { ReviewLeaveInput } from '../../presentation/schemas/review-leave.schema';

@Injectable()
export class ReviewLeaveUseCase {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  async execute(
    id: string,
    input: ReviewLeaveInput,
    user: AuthenticatedUser,
  ): Promise<LeaveEntity> {
    const updated = await this.leaveRepo.updateStatus(
      id,
      input.status,
      user.id,
      input.approvalNotes,
    );

    if (!updated) {
      throw new EntityNotFoundException('Leave', id);
    }

    return updated;
  }
}

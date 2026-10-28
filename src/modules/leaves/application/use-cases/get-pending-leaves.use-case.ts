import { Inject, Injectable } from '@nestjs/common';
import type { LeaveEntity } from '../../domain/entities/leave.entity';
import {
  LEAVE_REPOSITORY,
  type LeaveRepository,
} from '../../domain/repositories/leave.repository';

@Injectable()
export class GetPendingLeavesUseCase {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  async execute(): Promise<LeaveEntity[]> {
    return this.leaveRepo.findAllPending();
  }
}

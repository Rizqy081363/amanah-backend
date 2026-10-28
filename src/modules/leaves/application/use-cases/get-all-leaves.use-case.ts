import { Inject, Injectable } from '@nestjs/common';
import type { LeaveEntity } from '../../domain/entities/leave.entity';
import {
  LEAVE_REPOSITORY,
  type LeaveRepository,
} from '../../domain/repositories/leave.repository';
import type { QueryLeavesInput } from '../../presentation/schemas/query-leaves.schema';

@Injectable()
export class GetAllLeavesUseCase {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
  ) {}

  async execute(filters?: QueryLeavesInput): Promise<LeaveEntity[]> {
    return this.leaveRepo.findAll(filters);
  }
}

import { Module } from '@nestjs/common';
import {
  CancelLeaveUseCase,
  GetAllLeavesUseCase,
  GetEligibleSessionsUseCase,
  GetMyLeavesUseCase,
  GetPendingLeavesUseCase,
  RequestLeaveUseCase,
  ReviewLeaveUseCase,
} from './application/use-cases';
import { LEAVE_REPOSITORY } from './domain/repositories/leave.repository';
import { LeaveDrizzleRepository } from './infrastructure/drizzle/leave.drizzle-repository';
import { LeavesController } from './presentation/leaves.controller';

@Module({
  controllers: [LeavesController],
  providers: [
    {
      provide: LEAVE_REPOSITORY,
      useClass: LeaveDrizzleRepository,
    },
    RequestLeaveUseCase,
    ReviewLeaveUseCase,
    CancelLeaveUseCase,
    GetMyLeavesUseCase,
    GetEligibleSessionsUseCase,
    GetAllLeavesUseCase,
    GetPendingLeavesUseCase,
  ],
  exports: [
    LEAVE_REPOSITORY,
    RequestLeaveUseCase,
    ReviewLeaveUseCase,
    CancelLeaveUseCase,
    GetMyLeavesUseCase,
    GetEligibleSessionsUseCase,
    GetAllLeavesUseCase,
    GetPendingLeavesUseCase,
  ],
})
export class LeavesModule {}

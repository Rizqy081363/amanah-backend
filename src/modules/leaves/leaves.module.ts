import { Module } from '@nestjs/common';
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
  ],
  exports: [LEAVE_REPOSITORY],
})
export class LeavesModule {}

import { ClinicTimeModule } from '@common/time/clinic-time.module';
import { DrizzleModule } from '@database/drizzle/drizzle.module';
import { RedisModule } from '@common/redis/redis.module';
import { forwardRef, Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments.module';
import { CANDIDATE_ASSIGNMENT_PORT } from './contracts/candidate-assignment.contract';
import { CANDIDATE_RESOLVER_PORT } from './contracts/candidate-resolver.contract';
import { DrizzleCandidateAssignmentRepository } from './infrastructure/drizzle-candidate-assignment.repository';
import { CandidateAssignmentService } from './services/candidate-assignment.service';
import { CandidateResolverService } from './services/candidate-resolver.service';

@Module({
  imports: [
    DrizzleModule,
    RedisModule,
    ClinicTimeModule,
    forwardRef(() => AppointmentsModule),
  ],
  providers: [
    DrizzleCandidateAssignmentRepository,
    CandidateResolverService,
    CandidateAssignmentService,
    {
      provide: CANDIDATE_RESOLVER_PORT,
      useExisting: CandidateResolverService,
    },
    {
      provide: CANDIDATE_ASSIGNMENT_PORT,
      useExisting: CandidateAssignmentService,
    },
  ],
  exports: [
    CANDIDATE_RESOLVER_PORT,
    CANDIDATE_ASSIGNMENT_PORT,
    CandidateResolverService,
    CandidateAssignmentService,
  ],
})
export class CandidateAssignmentModule {}

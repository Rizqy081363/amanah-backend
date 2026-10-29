import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  type AuthenticatedUser,
  isStaffUser,
} from '../../../../common/auth';
import { DomainForbiddenException } from '../../../../common/exceptions/domain.exceptions';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import type { LeaveEntity } from '../../domain/entities/leave.entity';
import {
  LEAVE_REPOSITORY,
  type LeaveRepository,
} from '../../domain/repositories/leave.repository';
import {
  createRequestLeaveSchema,
  type RequestLeaveInput,
} from '../../presentation/schemas/request-leave.schema';

@Injectable()
export class RequestLeaveUseCase {
  constructor(
    @Inject(LEAVE_REPOSITORY)
    private readonly leaveRepo: LeaveRepository,
    private readonly clinicTimeService: ClinicTimeService,
  ) {}

  async execute(
    input: RequestLeaveInput,
    user: AuthenticatedUser,
  ): Promise<LeaveEntity> {
    if (!isStaffUser(user)) {
      throw new DomainForbiddenException('User bukan staf terdaftar');
    }

    const today = this.clinicTimeService.today();
    const validated = createRequestLeaveSchema(today).safeParse(input);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      throw new BadRequestException(
        issue?.message || 'Validasi permohonan cuti gagal',
      );
    }

    return this.leaveRepo.create({
      staffId: user.staff.id,
      practitionerId: user.staff.practitionerId ?? null,
      startDate: validated.data.startDate,
      endDate: validated.data.endDate,
      reason: validated.data.reason,
      type: validated.data.type,
      scope: validated.data.scope,
      sessionIds: validated.data.sessionIds,
      substituteStaffId: validated.data.substituteStaffId,
      documentUrl: validated.data.documentUrl,
    });
  }
}

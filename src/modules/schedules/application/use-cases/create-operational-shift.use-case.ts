import { Injectable, Logger } from '@nestjs/common';
import { type AuthenticatedUser, isAdminUser } from '../../../../common/auth';
import { DomainForbiddenException } from '../../../../common/exceptions';
import {
  CanonicalSessionDefConfig,
  DrizzleAdminScheduleConfigurationRepository,
} from '../../infrastructure/drizzle/repositories/admin/drizzle-admin-schedule-configuration.repository';
import type { CreateSessionDefInput } from '../../presentation/schemas/operational-shift.schema';

@Injectable()
export class CreateOperationalShiftUseCase {
  private readonly logger = new Logger(CreateOperationalShiftUseCase.name);

  constructor(
    private readonly configRepo: DrizzleAdminScheduleConfigurationRepository,
  ) {}

  async execute(
    dto: CreateSessionDefInput,
    user?: AuthenticatedUser,
  ): Promise<CanonicalSessionDefConfig> {
    if (user && !isAdminUser(user)) {
      throw new DomainForbiddenException(
        'Hanya admin klinik yang berwenang membuat shift operasional baru',
      );
    }

    this.logger.log(
      `Creating operational shift: label='${dto.label}', startsAt='${dto.defaultStartsAt}', endsAt='${dto.defaultEndsAt}'`,
    );

    const created = await this.configRepo.createSessionDef(dto);
    return created;
  }
}

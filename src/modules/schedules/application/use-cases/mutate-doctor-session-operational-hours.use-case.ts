import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AuthenticatedUser } from '../../../../common/auth';
import { QueueEventPublisher } from '../../../queue-engine/application/services/queue-event-publisher.service';
import {
  SCHEDULE_REPOSITORY,
  type ScheduleRepository,
} from '../../domain/repositories/schedule.repository';
import type { UpdateAdminDoctorSessionDto } from '../../presentation/dto/update-admin-doctor-session.dto';

@Injectable()
export class MutateDoctorSessionOperationalHoursUseCase {
  private readonly logger = new Logger(
    MutateDoctorSessionOperationalHoursUseCase.name,
  );

  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
    private readonly queueEventPublisher: QueueEventPublisher,
  ) {}

  async execute(
    practitionerId: string,
    sessionId: string,
    body: UpdateAdminDoctorSessionDto,
    _user?: AuthenticatedUser,
  ): Promise<any> {
    const result = await this.scheduleRepo.updateAdminDoctorSession(
      practitionerId,
      sessionId,
      body,
    );

    const hasTimingOrStatusChange =
      Boolean(body.startTime) ||
      Boolean(body.endTime) ||
      Boolean(body.sessionStatus) ||
      Boolean(body.roomId);

    if (hasTimingOrStatusChange && result?.data?.scheduleDate) {
      this.logger.log(
        `Doctor session operational mutation occurred for doctor ${practitionerId} on ${result.data.scheduleDate}. Publishing queue progression event.`,
      );

      await this.queueEventPublisher.publishProgression({
        eventType: 'shift_changed',
        serviceDate: result.data.scheduleDate,
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }
}

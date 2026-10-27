import { Injectable } from '@nestjs/common';
import type { ICandidateResolverPort } from '../../candidate-assignment/contracts/candidate-resolver.contract';
import type {
  DoctorCandidateGroup,
  DoctorCandidateItem,
  DoctorCandidatesResult,
} from '../../candidate-assignment/domain/entities/candidate-doctor.entity';
import type { RoomCandidateItem } from '../../candidate-assignment/domain/entities/candidate-room.entity';
import { CandidateResolverService } from '../../candidate-assignment/services/candidate-resolver.service';

export type { DoctorCandidatesResult, RoomCandidateItem };

@Injectable()
export class AppointmentCandidateResolver implements ICandidateResolverPort {
  constructor(private readonly delegate: CandidateResolverService) {}

  async resolveDoctorCandidates(
    appointmentId: string,
  ): Promise<DoctorCandidatesResult> {
    return this.delegate.resolveDoctorCandidates(appointmentId);
  }

  async resolveRoomCandidates(
    appointmentId: string,
  ): Promise<RoomCandidateItem[]> {
    return this.delegate.resolveRoomCandidates(appointmentId);
  }
}

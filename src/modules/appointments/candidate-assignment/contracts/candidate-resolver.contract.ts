import type { DoctorCandidatesResult } from '../domain/entities/candidate-doctor.entity';
import type { RoomCandidateItem } from '../domain/entities/candidate-room.entity';

export const CANDIDATE_RESOLVER_PORT = Symbol('CANDIDATE_RESOLVER_PORT');

export interface ICandidateResolverPort {
  resolveDoctorCandidates(appointmentId: string): Promise<DoctorCandidatesResult>;
  resolveRoomCandidates(appointmentId: string): Promise<RoomCandidateItem[]>;
}

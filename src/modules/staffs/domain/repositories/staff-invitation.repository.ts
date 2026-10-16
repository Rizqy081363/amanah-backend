import type { StaffInvitationStatus } from '../constants/staff-invitation.constants';
import { StaffInvitationEntity } from '../entities/staff-invitation.entity';

export const STAFF_INVITATION_REPOSITORY = 'STAFF_INVITATION_REPOSITORY';

export abstract class StaffInvitationRepository {
  abstract create(
    data: Omit<StaffInvitationEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StaffInvitationEntity>;
  abstract findById(id: string): Promise<StaffInvitationEntity | null>;
  abstract findByEmail(email: string): Promise<StaffInvitationEntity[]>;
  abstract findByTokenHash(
    tokenHash: string,
  ): Promise<StaffInvitationEntity | null>;
  abstract findPendingByEmail(
    email: string,
  ): Promise<StaffInvitationEntity | null>;
  abstract findAll(options?: {
    status?: string;
  }): Promise<StaffInvitationEntity[]>;
  abstract updateStatus(
    id: string,
    status: StaffInvitationStatus,
    acceptedUserId?: string | null,
  ): Promise<StaffInvitationEntity | null>;
}

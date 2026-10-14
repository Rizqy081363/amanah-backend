import { StaffInvitationEntity } from '../entities/staff-invitation.entity';

export const STAFF_INVITATION_REPOSITORY = 'STAFF_INVITATION_REPOSITORY';

export interface StaffInvitationRepository {
  create(
    data: Omit<StaffInvitationEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<StaffInvitationEntity>;
  findById(id: string): Promise<StaffInvitationEntity | null>;
  findByEmail(email: string): Promise<StaffInvitationEntity[]>;
  findByTokenHash(tokenHash: string): Promise<StaffInvitationEntity | null>;
  findPendingByEmail(email: string): Promise<StaffInvitationEntity | null>;
  findAll(options?: { status?: string }): Promise<StaffInvitationEntity[]>;
  updateStatus(
    id: string,
    status: 'pending' | 'accepted' | 'expired' | 'revoked',
  ): Promise<StaffInvitationEntity | null>;
}

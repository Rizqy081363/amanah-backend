import type {
  StaffInvitationStatus,
} from '../constants/staff-invitation.constants';

export class StaffInvitationEntity {
  id: string;
  email: string;
  roleId: string;
  roleCode: string;
  tokenHash: string;
  temporaryPasswordHash?: string | null;
  invitedBy?: string | null;
  acceptedUserId?: string | null;
  status: StaffInvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

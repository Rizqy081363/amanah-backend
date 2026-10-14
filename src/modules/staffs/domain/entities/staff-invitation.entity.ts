export class StaffInvitationEntity {
  id: string;
  email: string;
  roleCode: string;
  staffType: 'doctor' | 'midwife' | 'worker';
  tokenHash: string;
  temporaryPasswordHash?: string | null;
  invitedBy?: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: Date;
  acceptedAt?: Date | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

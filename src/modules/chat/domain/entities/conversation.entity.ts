export class ConversationEntity {
  id!: string;
  userId?: string | null;
  patientId?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  customerName!: string;
  customerEmail!: string;
  customerPhone?: string | null;
  medicalRecordNumber?: string | null;
  assignedPractitionerId?: string | null;
  assignedStaffId?: string | null;
  lastMessageAt!: string;
  lastCustomerMessageAt?: string | null;
  lastAdminMessageAt?: string | null;
  firstAdminReplyAt?: string | null;
  adminLastReadAt?: string | null;
  customerLastReadAt?: string | null;
  awaitingReply!: boolean;
  createdAt!: string;
  updatedAt!: string;
  lastMessagePreview?: string | null;
  unreadCount?: number;
  isOnline?: boolean;

  constructor(partial?: Partial<ConversationEntity>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}

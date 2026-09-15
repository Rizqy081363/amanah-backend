export class StaffEntity {
  id: string;
  userId: number;
  poliklinikId: string;
  fullName: string;
  profession: string;
  idCardNumber: string;
  photoUrl?: string | null;
  phoneNumber: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

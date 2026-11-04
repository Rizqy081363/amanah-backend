export class MaternalHusbandProfileEntity {
  id!: string;
  maternalIntakeId!: string;
  fullName!: string;
  nik?: string | null;
  birthDate?: string | null;
  age?: number | null;
  job?: string | null;
  education?: string | null;
  bloodType?: string | null;
  phoneNumber?: string | null;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<MaternalHusbandProfileEntity>) {
    Object.assign(this, partial);
  }
}

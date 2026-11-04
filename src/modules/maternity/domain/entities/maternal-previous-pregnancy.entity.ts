export class MaternalPreviousPregnancyEntity {
  id!: string;
  maternalIntakeId!: string;
  orderNumber!: number;
  birthYear?: string | null;
  birthWeightGrams?: number | null;
  birthLengthCm?: string | number | null;
  childSex?: string | null;
  gestationalAgeAtBirth?: string | null;
  birthAttendant?: string | null;
  deliveryMethod?: string | null;
  deliveryPlace?: string | null;
  complications?: string | null;
  createdAt!: string;

  constructor(partial: Partial<MaternalPreviousPregnancyEntity>) {
    Object.assign(this, partial);
  }
}

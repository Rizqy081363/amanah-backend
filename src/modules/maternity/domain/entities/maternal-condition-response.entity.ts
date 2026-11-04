export class MaternalConditionResponseEntity {
  id!: string;
  maternalIntakeId!: string;
  conditionCode!: string;
  hasCondition!: boolean;
  diagnosisYear?: number | null;
  notes?: string | null;
  createdAt!: string;

  constructor(partial: Partial<MaternalConditionResponseEntity>) {
    Object.assign(this, partial);
  }
}

export class MaternalContraceptiveHistoryEntity {
  id!: string;
  maternalIntakeId!: string;
  orderNumber!: number;
  startDate?: string | null;
  contraceptiveType?: string | null;
  durationText?: string | null;
  stopDate?: string | null;
  problems?: string | null;
  sideEffects?: string | null;
  createdAt!: string;

  constructor(partial: Partial<MaternalContraceptiveHistoryEntity>) {
    Object.assign(this, partial);
  }
}

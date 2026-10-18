export class QrSessionEntity {
  id: string;
  qrCodeIdentifier: string;
  shift: string;
  rotationSeconds: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  context?: string | null;
  createdBy?: string | null;
}

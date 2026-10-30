export class MailDeliveryError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] Delivery failed: ${message}`);
    this.name = 'MailDeliveryError';
  }
}

import type { MailSentResult } from '../types/mail-sent-result.type';
import type { SendMailPayload } from '../types/send-mail-payload.type';
export { MAIL_TRANSPORTER } from './mail-transporter.token';
export type { MailSentResult } from '../types/mail-sent-result.type';
export type { SendMailPayload } from '../types/send-mail-payload.type';

export interface MailTransporterPort {
  send(payload: SendMailPayload): Promise<MailSentResult>;
}

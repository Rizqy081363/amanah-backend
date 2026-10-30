import { MailDriver } from '../../common/constants/mail.constants';

export type MailConfig = {
  driver: MailDriver;
  resendApiKey?: string;
  port: number;
  host?: string;
  user?: string;
  password?: string;
  defaultEmail?: string;
  defaultName?: string;
  ignoreTLS: boolean;
  secure: boolean;
  requireTLS: boolean;
};

export type MailerSendMailOptions = {
  to:
    | string
    | string[]
    | { address: string; name?: string }
    | Array<{ address: string; name?: string }>;
  from?: string | { address: string; name?: string };
  subject?: string;
  text?: string;
  html?: string;
  replyTo?: string | { address: string; name?: string };
  templatePath?: string;
  context?: Record<string, unknown>;
};

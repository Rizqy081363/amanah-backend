export const MAIL_DRIVER = {
  SMTP: 'smtp',
  RESEND: 'resend',
} as const;

export type MailDriver = (typeof MAIL_DRIVER)[keyof typeof MAIL_DRIVER];

export const MAIL_PROVIDER_NAME = {
  SMTP: 'SMTP/Mailpit',
  RESEND: 'Resend',
} as const;

export const MAIL_DEFAULTS = {
  APP_NAME: 'Amanah Healthcare',
  NOREPLY_EMAIL: 'noreply@amanah.health',
  FALLBACK_HOST: 'localhost',
  FALLBACK_PORT: 1025,
  RESEND_API_URL: 'https://api.resend.com/emails',
} as const;

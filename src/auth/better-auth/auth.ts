import bcrypt from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { admin as adminPlugin, bearer, emailOTP } from 'better-auth/plugins';
import nodemailer from 'nodemailer';
import { Pool } from 'pg';
import {
  ac,
  admin,
  patient,
  staffDoctor,
  staffMidwife,
  staffWorker,
} from './permissions';

const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DATABASE_HOST || '127.0.0.1';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const port = isLocalHost
    ? process.env.POSTGRES_HOST_PORT || process.env.DATABASE_PORT || '5433'
    : process.env.DATABASE_PORT || '5432';
  const username = process.env.DATABASE_USERNAME || 'amanah';
  const password = process.env.DATABASE_PASSWORD || 'amanah_secret';
  const database = process.env.DATABASE_NAME || 'amanah_healthcare';

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
};

const pool = new Pool({
  connectionString: getDatabaseUrl(),
});

const smtpHost = process.env.SMTP_HOST || process.env.MAIL_HOST || '127.0.0.1';
const isLocalSmtp = smtpHost === 'localhost' || smtpHost === '127.0.0.1';
const smtpPort = parseInt(
  isLocalSmtp
    ? process.env.SMTP_HOST_PORT ||
        process.env.SMTP_PORT ||
        process.env.MAIL_PORT ||
        '1025'
    : process.env.SMTP_PORT || process.env.MAIL_PORT || '1025',
  10,
);
const mailFrom =
  process.env.MAIL_FROM ||
  process.env.MAIL_DEFAULT_EMAIL ||
  'noreply@amanah-healthcare.local';
const mailFromName = process.env.MAIL_DEFAULT_NAME || 'Amanah Healthcare';

const mailTransporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: (process.env.SMTP_SECURE || process.env.MAIL_SECURE) === 'true',
  ignoreTLS: true,
});

async function sendSmtpEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  try {
    await mailTransporter.sendMail({
      from: `"${mailFromName}" <${mailFrom}>`,
      to,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(`[BetterAuth:SMTP] Failed to send email to ${to}:`, err);
  }
}

export const auth = betterAuth({
  appName: 'Amanah Healthcare',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  basePath: '/api/auth',
  secret:
    process.env.BETTER_AUTH_SECRET ||
    'dev-insecure-secret-replace-in-env-file-min-32-bytes',
  database: pool,
  trustedOrigins: [
    process.env.FRONTEND_DOMAIN || 'http://localhost:3000',
    process.env.BACKEND_DOMAIN || 'http://localhost:3001',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || 'PENDING_USER_GOOGLE_CLIENT_ID',
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET || 'PENDING_USER_GOOGLE_CLIENT_SECRET',
      prompt: 'select_account',
      requireEmailVerification: true,
      accessType: 'offline',
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      void sendSmtpEmail({
        to: user.email,
        subject: 'Reset Password - Amanah Healthcare',
        html: `<p>Halo <strong>${user.name}</strong>,</p><p>Kami menerima permintaan untuk mereset kata sandi akun Anda di Amanah Healthcare. Klik tautan berikut untuk membuat kata sandi baru:</p><p><a href="${url}">Reset Kata Sandi</a></p><p>Tautan ini berlaku selama 1 jam.</p>`,
        text: `Reset kata sandi: ${url}`,
      });
    },
    password: {
      hash: async (password: string) => bcrypt.hash(password, 10),
      verify: async ({
        hash,
        password,
      }: {
        hash: string;
        password: string;
      }) => {
        if (!hash) return false;
        return bcrypt.compare(password, hash);
      },
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      void sendSmtpEmail({
        to: user.email,
        subject: 'Verifikasi Email - Amanah Healthcare',
        html: `<p>Halo <strong>${user.name}</strong>,</p><p>Terima kasih telah mendaftar di Amanah Healthcare. Klik tautan di bawah untuk memverifikasi email Anda:</p><p><a href="${url}">Verifikasi Email</a></p>`,
        text: `Verifikasi email: ${url}`,
      });
    },
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled:
      process.env.NODE_ENV === 'production' ||
      process.env.RATE_LIMIT_ENABLED === 'true',
    customRules: {
      '/sign-in/social': { window: 60, max: 10 },
      '/sign-in/email': { window: 60, max: 5 },
      '/send-verification-email': { window: 60, max: 20 },
      '/email-otp/send-verification-otp': { window: 60, max: 5 },
      '/email-otp/verify-email': { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    disableCSRFCheck: false,
    disableOriginCheck: false,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
    database: { generateId: 'uuid' },
  },
  plugins: [
    adminPlugin({
      ac,
      roles: { admin, staffDoctor, staffMidwife, staffWorker, patient },
      defaultRole: 'patient',
      adminRoles: ['admin'],
      impersonationSessionDuration: 60 * 15,
      bannedUserMessage:
        'Akun Anda dinonaktifkan. Hubungi administrator Amanah.',
    }),
    bearer(),
    emailOTP({
      expiresIn: 300,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        let subject = 'Kode Verifikasi Akun - Amanah Healthcare';
        let heading = 'Verifikasi Email Anda';
        let desc =
          'Gunakan kode OTP berikut untuk memverifikasi akun baru Anda di Amanah Healthcare:';

        if (type === 'sign-in') {
          subject = 'Kode OTP Masuk - Amanah Healthcare';
          heading = 'Kode OTP Masuk';
          desc = 'Gunakan kode OTP berikut untuk masuk ke akun Anda:';
        } else if (type === 'forget-password') {
          subject = 'Kode Reset Password - Amanah Healthcare';
          heading = 'Reset Password Akun';
          desc = 'Gunakan kode OTP berikut untuk mereset kata sandi akun Anda:';
        }

        await sendSmtpEmail({
          to: email,
          subject,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
              <h2 style="color: #0f172a; margin-top: 0;">${heading}</h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.5;">${desc}</p>
              <div style="background-color: #f1f5f9; border-radius: 6px; padding: 16px; text-align: center; margin: 24px 0;">
                <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0284c7;">${otp}</span>
              </div>
              <p style="color: #64748b; font-size: 13px; line-height: 1.4;">Kode verifikasi ini berlaku selama <strong>5 menit</strong>. Jangan berikan kode ini kepada siapapun termasuk pihak Amanah Healthcare.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">Amanah Healthcare — Sistem Informasi & Operasional Klinik Terpadu</p>
            </div>
          `,
          text: `${heading}\n\n${desc}\nKode OTP: ${otp}\n(Berlaku 5 menit)`,
        });
      },
    }),
  ],
});

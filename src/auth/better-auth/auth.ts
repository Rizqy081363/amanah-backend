import bcrypt from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { admin as adminPlugin, bearer } from 'better-auth/plugins';
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

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://amanah:amanah_secret@127.0.0.1:5433/amanah_healthcare',
});

const smtpHost = process.env.SMTP_HOST || process.env.MAIL_HOST || '127.0.0.1';
const smtpPort = parseInt(
  process.env.SMTP_PORT || process.env.MAIL_PORT || '1025',
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
    requireEmailVerification: false,
    autoSignIn: true,
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
  ],
});

import bcrypt from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { admin as adminPlugin, bearer, emailOTP } from 'better-auth/plugins';
import nodemailer from 'nodemailer';
import { Pool } from 'pg';
import { env } from '../../config/env';
import {
  ac,
  admin,
  patient,
  staffDoctor,
  staffMidwife,
  staffWorker,
} from './permissions';
import { buildOriginPolicy } from '../../config/origin-policy';

const getDatabaseUrl = (): string => {
  return `postgresql://${env.DATABASE_USERNAME}:${env.DATABASE_PASSWORD}@${env.DATABASE_HOST}:${env.DATABASE_PORT}/${env.DATABASE_NAME}`;
};

const pool = new Pool({
  connectionString: getDatabaseUrl(),
});

const smtpHost = env.SMTP_HOST;
const smtpPort = env.SMTP_PORT;
const mailFrom = env.MAIL_DEFAULT_EMAIL || 'noreply@amanah-healthcare.local';
const mailFromName = env.MAIL_DEFAULT_NAME || 'Amanah Healthcare';

const mailTransporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: false,
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

const devOriginPatterns = (env.APP_DEV_ORIGIN_PATTERNS || '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

const rawCorsOrigins = (env.APP_CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const betterAuthOriginPolicy = buildOriginPolicy({
  appEnv: env.NODE_ENV || 'development',
  publicUrl: env.FRONTEND_DOMAIN,
  extraOrigins: [
    ...rawCorsOrigins,
    env.BACKEND_DOMAIN || '',
  ],
  devPatterns: devOriginPatterns,
});

const trustedOrigins = [
  ...betterAuthOriginPolicy.exact,
  ...betterAuthOriginPolicy.patterns,
];

export const auth = betterAuth({
  appName: 'Amanah Healthcare',
  baseURL: {
    allowedHosts: trustedOrigins,
    fallback: env.BETTER_AUTH_URL,
    protocol: 'auto',
  },
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  database: pool,
  trustedOrigins,
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
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
    skipStateCookieCheck: true,
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
      env.NODE_ENV === 'production' ||
      process.env.RATE_LIMIT_ENABLED === 'true',
    customRules: {
      '/sign-in/social': { window: 60, max: 10 },
      '/sign-in/email': { window: 60, max: 5 },
      '/send-verification-email': { window: 60, max: 20 },
      '/email-otp/send-verification-otp': { window: 60, max: 5 },
      '/email-otp/verify-email': { window: 60, max: 5 },
      '/email-otp/request-password-reset': { window: 60, max: 5 },
      '/email-otp/check-verification-otp': { window: 60, max: 10 },
      '/email-otp/reset-password': { window: 60, max: 5 },
    },
  },
  advanced: {
    trustedProxyHeaders: true,
    useSecureCookies: env.NODE_ENV === 'production',
    disableCSRFCheck: false,
    disableOriginCheck: false,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
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

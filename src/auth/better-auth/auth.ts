import { betterAuth } from 'better-auth';
import { admin as adminPlugin, bearer } from 'better-auth/plugins';
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
    enabled: true,
    customRules: {
      '/sign-in/social': { window: 60, max: 10 },
      '/sign-in/email': { window: 60, max: 5 },
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

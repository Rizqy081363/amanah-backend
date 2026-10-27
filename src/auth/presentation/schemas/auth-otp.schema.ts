import { z } from 'zod';

export const AuthResendOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email tidak valid' }),
  type: z.enum(['email-verification', 'forgot-password']),
});

export const AuthResendVerificationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email tidak valid' }),
});

export const AuthVerifyOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email tidak valid' }),
  otp: z
    .string()
    .trim()
    .length(6, { message: 'Kode OTP harus berupa 6 digit angka' }),
});

export const AuthResetPasswordOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email tidak valid' }),
  otp: z
    .string()
    .trim()
    .length(6, { message: 'Kode OTP harus berupa 6 digit angka' }),
  password: z
    .string()
    .min(6, { message: 'Kata sandi baru minimal 6 karakter' }),
});

import { z } from 'zod';

export const AuthForgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email tidak valid' }),
});

export const AuthResetPasswordSchema = z.object({
  hash: z.string().trim().min(1, { message: 'Token reset wajib disertakan' }),
  password: z
    .string()
    .min(6, { message: 'Kata sandi baru minimal 6 karakter' }),
});

export const AuthConfirmEmailSchema = z.object({
  hash: z.string().trim().min(1, { message: 'Hash verifikasi wajib disertakan' }),
});

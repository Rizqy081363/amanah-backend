import { z } from 'zod';

export const ChangePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, { message: 'Kata sandi saat ini wajib diisi' }),
  newPassword: z
    .string()
    .min(6, { message: 'Kata sandi baru minimal 6 karakter' }),
});

export const RequestEmailChangeSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email baru tidak valid' }),
  currentPassword: z.string().optional(),
});

export const LinkGoogleSchema = z.object({
  idToken: z
    .string()
    .trim()
    .min(1, { message: 'Google ID token wajib disertakan' }),
});

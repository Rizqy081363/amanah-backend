import { z } from 'zod';

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().optional(),
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

export const LinkGoogleSchema = z
  .object({
    idToken: z
      .string()
      .trim()
      .min(1, { message: 'Google ID token tidak boleh kosong' })
      .optional(),
    code: z
      .string()
      .trim()
      .min(1, { message: 'Authorization code tidak boleh kosong' })
      .optional(),
    redirectUri: z.string().trim().min(1).optional(),
  })
  .refine((data) => Boolean(data.idToken || data.code), {
    message: 'Google ID token atau Authorization Code wajib disertakan',
    path: ['idToken'],
  });

import { z } from 'zod';

export const AuthUpdateSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email tidak valid' })
    .optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  password: z
    .string()
    .min(6, { message: 'Kata sandi baru minimal 6 karakter' })
    .optional(),
  oldPassword: z.string().min(1).optional(),
});

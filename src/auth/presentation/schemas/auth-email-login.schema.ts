import { z } from 'zod';

export const AuthEmailLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email tidak valid' }),
  password: z.string().min(1, { message: 'Kata sandi wajib diisi' }),
  clientId: z.string().trim().optional(),
});

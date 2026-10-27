import { z } from 'zod';

export const AuthRegisterSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: 'Format email tidak valid' }),
  password: z.string().min(6, { message: 'Kata sandi minimal 6 karakter' }),
  firstName: z.string().trim().min(1, { message: 'Nama depan wajib diisi' }),
  lastName: z.string().trim().min(1, { message: 'Nama belakang wajib diisi' }),
});

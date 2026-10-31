import { z } from 'zod';

export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1, 'Nama lengkap wajib diisi'),
  email: z.string().trim().email('Format email tidak valid'),
  phone: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((val) => (val === '' ? null : val))
    .refine(
      (val) => {
        if (!val) return true;
        return /^[+]?[\d\s-]+$/.test(val);
      },
      {
        message:
          'Nomor telepon hanya boleh berisi angka (digit 0-9) dan karakter standar (+, -, spasi)',
      },
    )
    .refine(
      (val) => {
        if (!val) return true;
        const digits = val.replace(/\D/g, '');
        return digits.length >= 8 && digits.length <= 15;
      },
      {
        message: 'Nomor telepon harus memiliki panjang 8 hingga 15 digit angka',
      },
    ),
  status: z
    .enum(['pending_verification', 'active', 'inactive', 'suspended'], {
      message:
        'Status harus salah satu dari: active, inactive, pending_verification, suspended',
    })
    .optional(),
  preferredLocale: z.string().trim().max(16).optional(),
  roleIds: z.array(z.string().uuid('Format ID peran tidak valid')).optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

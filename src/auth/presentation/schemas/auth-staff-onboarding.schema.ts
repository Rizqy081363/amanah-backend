import { z } from 'zod';

export const AuthStaffOnboardingSchema = z.object({
  role: z.enum(['doctor', 'midwife', 'worker', 'staff']).optional(),
  fullName: z
    .string()
    .trim()
    .min(1, { message: 'Nama lengkap tidak boleh kosong' }),
  phoneNumber: z.string().trim().optional(),
  staffCode: z.string().trim().optional(),
  profession: z.string().trim().optional(),
  poliklinikId: z.string().trim().optional(),
  licenseNumber: z.string().trim().optional(),
  birthPlace: z.string().trim().optional(),
  birthDate: z.string().trim().optional(),
  gender: z.enum(['male', 'female']).optional(),
  nationalId: z.string().trim().optional(),
  provinsi: z.string().trim().optional(),
  provinsiId: z.string().trim().optional(),
  kabupaten: z.string().trim().optional(),
  kabupatenId: z.string().trim().optional(),
  kecamatan: z.string().trim().optional(),
  kecamatanId: z.string().trim().optional(),
  kelurahan: z.string().trim().optional(),
  kelurahanId: z.string().trim().optional(),
  line1: z.string().trim().optional(),
});

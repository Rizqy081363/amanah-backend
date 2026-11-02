import { z } from 'zod';

export const UpdatePatientSchema = z
  .object({
    medicalRecordNumber: z.string().optional().or(z.literal('')),
    fullName: z
      .string()
      .min(1, 'Nama lengkap wajib diisi')
      .max(150, 'Nama lengkap maksimal 150 karakter')
      .optional(),
    nik: z
      .string()
      .regex(/^\d{16}$/, { message: 'NIK harus berupa 16 digit angka' })
      .optional()
      .or(z.literal('')),
    motherName: z.string().max(150).optional().or(z.literal('')),
    birthPlace: z.string().max(100).optional().or(z.literal('')),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'Format tanggal lahir harus YYYY-MM-DD',
      })
      .optional()
      .or(z.literal('')),
    gender: z
      .enum(['male', 'female'], {
        message: 'Pilih jenis kelamin valid (male atau female)',
      })
      .optional(),
    bloodType: z.string().max(10).optional().or(z.literal('')),
    phone: z
      .string()
      .regex(/^(\+62|62|0)[0-9]{8,15}$/, {
        message: 'Format nomor telepon tidak valid',
      })
      .optional()
      .or(z.literal('')),
    email: z
      .string()
      .email({ message: 'Format email tidak valid' })
      .optional()
      .or(z.literal('')),
    occupation: z.string().max(100).optional().or(z.literal('')),
    fullAddress: z.string().max(1000).optional().or(z.literal('')),
    line1: z.string().max(500).optional().or(z.literal('')),
    provinceName: z.string().max(100).optional().or(z.literal('')),
    provinceCode: z.string().max(20).optional().or(z.literal('')),
    regencyName: z.string().max(100).optional().or(z.literal('')),
    regencyCode: z.string().max(20).optional().or(z.literal('')),
    districtName: z.string().max(100).optional().or(z.literal('')),
    districtCode: z.string().max(20).optional().or(z.literal('')),
    villageName: z.string().max(100).optional().or(z.literal('')),
    villageCode: z.string().max(20).optional().or(z.literal('')),
    emergencyContactName: z.string().max(150).optional().or(z.literal('')),
    emergencyContactPhone: z
      .string()
      .regex(/^(\+62|62|0)[0-9]{8,15}$/, {
        message: 'Format nomor kontak darurat tidak valid',
      })
      .optional()
      .or(z.literal('')),
    emergencyContactRelationship: z
      .string()
      .max(50)
      .optional()
      .or(z.literal('')),
    medicalHistory: z.string().max(2000).optional().or(z.literal('')),
    status: z.enum(['active', 'inactive']).optional(),
    avatarUrl: z.string().url().optional().or(z.literal('')),
  })
  .strict();

export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;

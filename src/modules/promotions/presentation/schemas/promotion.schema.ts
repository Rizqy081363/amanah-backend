import { z } from 'zod';

export const BasePromotionSchema = z.object({
  serviceId: z.string().uuid('ID service harus berupa UUID yang valid').optional().nullable(),
  title: z
    .string()
    .trim()
    .min(1, 'Judul promo tidak boleh kosong')
    .max(80, 'Judul promo maksimal 80 karakter'),
  summary: z
    .string()
    .trim()
    .min(1, 'Ringkasan promo tidak boleh kosong')
    .max(160, 'Ringkasan promo maksimal 160 karakter'),
  body: z.string().trim().max(1000, 'Deskripsi maksimal 1000 karakter').optional().nullable(),
  terms: z.string().trim().max(500, 'Syarat & ketentuan maksimal 500 karakter').optional().nullable(),
  imageType: z.enum(['static', 'url']),
  imageValue: z
    .string()
    .trim()
    .min(1, 'Nilai gambar tidak boleh kosong')
    .max(2048, 'Nilai gambar maksimal 2048 karakter'),
  imageAlt: z
    .string()
    .trim()
    .min(1, 'Teks alternatif gambar tidak boleh kosong')
    .max(150, 'Teks alternatif maksimal 150 karakter'),
  ctaLabel: z.string().trim().max(30, 'Label tombol maksimal 30 karakter').optional().nullable(),
  ctaUrl: z.string().trim().max(2048, 'URL tujuan tombol maksimal 2048 karakter').optional().nullable(),
  showBanner: z.boolean().default(true),
  showModal: z.boolean().default(false),
  showSection: z.boolean().default(true),
  modalFrequency: z
    .enum(['once_per_session', 'once_per_day', 'once_per_week'])
    .default('once_per_day'),
  modalDelaySec: z.number().int().min(0).max(30).default(3),
  modalMode: z.enum(['card', 'image_only']).default('card'),
  priority: z.number().int().default(0),
  isPublished: z.boolean().default(false),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  broadcastToUsers: z.boolean().default(false),
  broadcastChannels: z
    .array(z.enum(['in_app', 'push', 'email']))
    .default(['in_app', 'push']),
});

export const CreatePromotionSchema = BasePromotionSchema.refine(
  (data) => {
    const hasCtaLabel = Boolean(data.ctaLabel && data.ctaLabel.trim());
    const hasCtaUrl = Boolean(data.ctaUrl && data.ctaUrl.trim());
    return hasCtaLabel === hasCtaUrl;
  },
  {
    message: 'Label tombol dan URL tujuan harus diisi bersamaan atau dikosongkan keduanya',
    path: ['ctaUrl'],
  },
).refine(
  (data) => {
    return data.showBanner || data.showModal || data.showSection;
  },
  {
    message: 'Setidaknya satu penempatan (Banner, Modal, atau Section) wajib diaktifkan',
    path: ['showBanner'],
  },
);

export type CreatePromotionInput = z.infer<typeof CreatePromotionSchema>;

export const UpdatePromotionSchema = BasePromotionSchema.partial();
export type UpdatePromotionInput = z.infer<typeof UpdatePromotionSchema>;

export const QueryPromotionsSchema = z.object({
  status: z
    .enum(['all', 'draft', 'scheduled', 'live', 'expired', 'archived'])
    .optional()
    .default('all'),
  search: z.string().optional(),
  serviceId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export type QueryPromotionsInput = z.infer<typeof QueryPromotionsSchema>;

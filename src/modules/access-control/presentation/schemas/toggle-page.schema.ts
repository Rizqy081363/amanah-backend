import { z } from 'zod';

export const TogglePageSchema = z.object({
  isEnabled: z.boolean({
    message: 'Status ketersediaan halaman harus berupa boolean',
  }),
});

export type TogglePageInput = z.infer<typeof TogglePageSchema>;

export const PageParamSchema = z.object({
  id: z.string().uuid({
    message: 'ID halaman harus berupa format UUID yang valid',
  }),
});

export type PageParamInput = z.infer<typeof PageParamSchema>;

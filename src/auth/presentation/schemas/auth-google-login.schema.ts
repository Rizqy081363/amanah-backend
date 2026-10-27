import { z } from 'zod';

export const AuthGoogleLoginSchema = z.object({
  idToken: z
    .string()
    .trim()
    .min(1, { message: 'Token Google wajib disertakan' }),
  clientId: z.string().trim().optional(),
});

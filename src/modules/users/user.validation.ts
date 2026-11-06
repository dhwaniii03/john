import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  profile_image: z.string().optional().nullable(),
  notification_enabled: z.boolean().optional(),
  location_enabled: z.boolean().optional(),
});

export const updateTransportModeSchema = z.object({
  transport_mode: z.enum(['DRIVER', 'CYCLIST', 'WALKER']),
});

export const userIdParamSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
});

export const userQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  transport_mode: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateTransportModeInput = z.infer<typeof updateTransportModeSchema>;

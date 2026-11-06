import { z } from 'zod';

export const createNotificationSchema = z.object({
  user_id: z.coerce.number().int().positive().optional().default(1),
  type: z.string().optional().default('SYSTEM'),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  data: z.record(z.string(), z.any()).optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  deliveryType: z.string().optional(),
  sendOn: z.string().optional(),
  scheduledAt: z.string().optional(),
  relatedHazardId: z.string().optional(),
  relatedHazardTitle: z.string().optional(),
  audience: z.any().optional(),
  targetAudience: z.any().optional(),
}).passthrough();

export const updateNotificationSchema = z.object({
  title: z.string().optional(),
  message: z.string().optional(),
  type: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  deliveryType: z.string().optional(),
  sendOn: z.string().optional(),
  scheduledAt: z.string().optional(),
  relatedHazardId: z.string().optional(),
  relatedHazardTitle: z.string().optional(),
  audience: z.any().optional(),
  targetAudience: z.any().optional(),
  data: z.record(z.string(), z.any()).optional(),
}).passthrough();

export const notificationIdParamSchema = z.object({
  id: z.string().min(1, 'Notification ID is required'),
});

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  is_read: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;

import { z } from 'zod';

export const createSearchHistorySchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  subtitle: z.string().max(500).optional().nullable(),
  place_id: z.string().max(255).optional().nullable(),
  placeId: z.string().max(255).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export const searchHistoryQuerySchema = z.object({
  limit: z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() !== '') {
      const num = parseInt(val, 10);
      return isNaN(num) ? undefined : num;
    }
    return val;
  }, z.number().min(1).max(50).optional()),
});

export const searchHistoryIdParamSchema = z.object({
  id: z.string().min(1, 'Search history ID is required'),
});

export type CreateSearchHistoryInput = z.infer<typeof createSearchHistorySchema>;
export type SearchHistoryQueryInput = z.infer<typeof searchHistoryQuerySchema>;


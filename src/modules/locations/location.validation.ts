import { z } from 'zod';

export const transportModeSchema = z.enum(['DRIVER', 'CYCLIST', 'WALKER']);

export const locationUpdateSchema = z.object({
  lat: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  lng: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  speed: z.number().nonnegative('Speed cannot be negative').optional(),
  heading: z.preprocess((val) => (typeof val === 'number' && val < 0 ? undefined : val), z.number().min(0, 'Heading must be between 0 and 360').max(360, 'Heading must be between 0 and 360').optional()),
  accuracy: z.number().nonnegative('Accuracy cannot be negative').optional(),
  journeyId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  clientTimestamp: z.number().int().positive('clientTimestamp must be a positive integer milliseconds timestamp'),
});

export const locationHeartbeatSchema = z.object({}).optional();

export const locationModeSchema = z.object({
  transportMode: transportModeSchema,
});

export const hazardsAreaSchema = z.object({
  minLat: z.number().min(-90).max(90),
  minLng: z.number().min(-180).max(180),
  maxLat: z.number().min(-90).max(90),
  maxLng: z.number().min(-180).max(180),
  limit: z.number().int().positive().max(100).optional().default(50),
}).refine((data) => data.minLat <= data.maxLat, {
  message: 'minLat must be less than or equal to maxLat',
  path: ['minLat'],
}).refine((data) => data.minLng <= data.maxLng, {
  message: 'minLng must be less than or equal to maxLng',
  path: ['minLng'],
}).refine((data) => (data.maxLat - data.minLat) <= 0.5, {
  message: 'Bounding box latitude span cannot exceed 0.5 degrees',
  path: ['maxLat'],
}).refine((data) => (data.maxLng - data.minLng) <= 0.5, {
  message: 'Bounding box longitude span cannot exceed 0.5 degrees',
  path: ['maxLng'],
});

export type LocationUpdatePayload = z.infer<typeof locationUpdateSchema>;
export type LocationModePayload = z.infer<typeof locationModeSchema>;
export type HazardsAreaPayload = z.infer<typeof hazardsAreaSchema>;

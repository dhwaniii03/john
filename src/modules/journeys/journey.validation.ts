import { z } from 'zod';

export const startJourneySchema = z.object({
  transport_mode: z.enum(['DRIVER', 'CYCLIST', 'WALKER']).optional(),
  title: z.string().optional(),
  origin_name: z.string().optional(),
  destination_name: z.string().optional(),
  start_latitude: z.coerce.number().min(-90).max(90, 'Start latitude must be between -90 and 90'),
  start_longitude: z.coerce.number().min(-180).max(180, 'Start longitude must be between -180 and 180'),
  end_latitude: z.coerce.number().min(-90).max(90).optional(),
  end_longitude: z.coerce.number().min(-180).max(180).optional(),
  route_polyline: z.string().optional(),
  waypoints: z
    .array(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        name: z.string().optional(),
        order: z.number().optional(),
      })
    )
    .optional(),
});

export const endJourneySchema = z.object({
  end_latitude: z.coerce.number().min(-90).max(90).optional(),
  end_longitude: z.coerce.number().min(-180).max(180).optional(),
  distance_km: z.coerce.number().nonnegative().optional(),
  duration_minutes: z.coerce.number().nonnegative().optional(),
  avg_speed_kmh: z.coerce.number().nonnegative().optional(),
  hazards_count: z.coerce.number().int().nonnegative().optional(),
  cyclists_nearby: z.coerce.number().int().nonnegative().optional(),
  walkers_nearby: z.coerce.number().int().nonnegative().optional(),
  route_polyline: z.string().optional(),
  status: z.enum(['COMPLETED', 'CANCELLED']).optional().default('COMPLETED'),
});

export const journeyIdParamSchema = z.object({
  id: z.string().min(1, 'Journey ID is required'),
});

export const journeyQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  status: z.string().optional(),
  transport_mode: z.string().optional(),
});

export const updateLocationSchema = z.object({
  journey_id: z.number().int().positive().optional(),
  latitude: z.coerce.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  speed: z.coerce.number().nonnegative().optional(),
  heading: z.coerce.number().min(0).max(360).optional(),
  transport_mode: z.enum(['DRIVER', 'CYCLIST', 'WALKER']).optional(),
});

export const nearbyLocationQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90, 'Latitude is required between -90 and 90'),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude is required between -180 and 180'),
  radius: z.coerce.number().positive().max(50).optional().default(5), // in km
  transport_mode: z.enum(['DRIVER', 'CYCLIST', 'WALKER']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

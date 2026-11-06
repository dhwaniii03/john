import { z } from 'zod';

export const createHazardSchema = z.object({
  category_id: z.number().int().positive().optional(),
  title: z.string().min(2, 'Title must be at least 2 characters long'),
  description: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['ACTIVE', 'INVESTIGATING', 'RESOLVED', 'active', 'investigating', 'resolved']).optional(),
  source: z.enum(['ADMIN', 'USER', 'OFFICIAL_DATASET']).optional(),
  image_url: z.string().optional(),
  address: z.string().optional(),
  expires_at: z.string().optional(),
});

export const updateHazardSchema = z.object({
  category_id: z.number().int().positive().optional(),
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['ACTIVE', 'INVESTIGATING', 'RESOLVED', 'active', 'investigating', 'resolved']).optional(),
  image_url: z.string().optional(),
  address: z.string().optional(),
  expires_at: z.string().optional(),
});

export const hazardStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INVESTIGATING', 'RESOLVED', 'active', 'investigating', 'resolved']),
});

export const nearbyHazardQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90, 'Latitude is required between -90 and 90'),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude is required between -180 and 180'),
  radius: z.coerce.number().positive().max(100).optional().default(10), // in kilometers
  status: z.string().optional(),
  severity: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export const hazardQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  category_id: z.coerce.number().int().positive().optional(),
  category_slug: z.string().optional(),
  severity: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
});

export const hazardIdParamSchema = z.object({
  id: z.string().min(1, 'Hazard ID is required'),
});

export const categoryIdParamSchema = z.object({
  id: z.string().min(1, 'Category ID is required'),
});

export const createHazardCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  slug: z.string().optional(),
  description: z.string().optional(),
  icon_url: z.string().optional(),
  default_severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'low', 'medium', 'high', 'critical']).optional(),
  default_expiry_days: z.coerce.number().int().positive('Default expiry days must be a positive integer').optional(),
  is_active: z.boolean().optional(),
});

export const updateHazardCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long').optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  icon_url: z.string().optional(),
  default_severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'low', 'medium', 'high', 'critical']).optional(),
  default_expiry_days: z.coerce.number().int().positive('Default expiry days must be a positive integer').optional(),
  is_active: z.boolean().optional(),
});

export const reportIdParamSchema = z.object({
  id: z.string().min(1, 'Report ID is required'),
});

export const createHazardReportSchema = z.object({
  category_id: z.number().int().positive().optional(),
  title: z.string().optional(),
  description: z.string().min(5, 'Description must be at least 5 characters long'),
  latitude: z.coerce.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  address: z.string().optional(),
  image_url: z.string().optional(),
});

export const reportQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  status: z.string().optional(),
  category_id: z.coerce.number().int().positive().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
});

export const rejectReportSchema = z.object({
  rejection_reason: z.string().min(2, 'Rejection reason is required'),
});

export const approveReportSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  title: z.string().optional(),
  category_id: z.number().int().positive().optional(),
});

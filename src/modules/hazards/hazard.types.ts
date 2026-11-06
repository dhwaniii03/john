export type HazardSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type HazardStatus = 'ACTIVE' | 'INVESTIGATING' | 'RESOLVED';
export type HazardSource = 'ADMIN' | 'USER' | 'OFFICIAL_DATASET';
export type ReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface HazardCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  default_severity: HazardSeverity;
  default_expiry_days: number;
  usage_count?: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateHazardCategoryDTO {
  name: string;
  slug?: string;
  description?: string;
  icon_url?: string;
  default_severity?: HazardSeverity;
  default_expiry_days?: number;
  is_active?: boolean;
}

export interface UpdateHazardCategoryDTO {
  name?: string;
  slug?: string;
  description?: string;
  icon_url?: string;
  default_severity?: HazardSeverity;
  default_expiry_days?: number;
  is_active?: boolean;
}

export interface Hazard {
  id: number;
  category_id?: number;
  category_name?: string;
  category_slug?: string;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
  severity: HazardSeverity;
  status: HazardStatus;
  source: HazardSource;
  reported_by?: number;
  reporter_name?: string;
  image_url?: string;
  address?: string;
  distance_km?: number;
  confirmation_count?: number;
  resolved_count?: number;
  last_confirmed_at?: Date;
  expires_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface HazardConfirmation {
  id: number;
  hazard_id: number;
  user_id?: number;
  confirmed_at: Date;
}

export interface HazardResolution {
  id: number;
  hazard_id: number;
  user_id?: number;
  resolved_at: Date;
}

export interface CreateHazardDTO {
  category_id?: number;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
  severity?: HazardSeverity;
  status?: HazardStatus;
  source?: HazardSource;
  reported_by?: number;
  image_url?: string;
  address?: string;
  expires_at?: Date | string;
}

export interface UpdateHazardDTO {
  category_id?: number;
  title?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  severity?: HazardSeverity;
  status?: HazardStatus;
  image_url?: string;
  address?: string;
  expires_at?: Date | string;
}

export interface HazardFilterOptions {
  category_id?: number;
  category_slug?: string;
  severity?: string;
  status?: string;
  source?: string;
  reported_by?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface NearbyHazardOptions {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  status?: string;
  severity?: string;
  limit?: number;
}

export interface HazardReport {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  category_id?: number;
  category_name?: string;
  category_is_active?: boolean;
  hazard_id?: number;
  title?: string;
  description: string;
  latitude: number;
  longitude: number;
  address?: string;
  image_url?: string;
  status: ReportStatus;
  reviewed_by?: number;
  reviewer_name?: string;
  reviewed_at?: Date;
  rejection_reason?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateHazardReportDTO {
  category_id?: number;
  title?: string;
  description: string;
  latitude: number;
  longitude: number;
  address?: string;
  image_url?: string;
}

export interface ReportFilterOptions {
  user_id?: number;
  status?: string;
  category_id?: number;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

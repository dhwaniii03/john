export type TransportMode = 'DRIVER' | 'CYCLIST' | 'WALKER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface UserStats {
  journeys: number;
  completed_journeys: number;
  total_journeys: number;
  total_distance_km: number;
  hazards_reported: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_image?: string;
  transport_mode: TransportMode;
  status: UserStatus;
  notification_enabled: boolean;
  location_enabled: boolean;
  role: string;
  last_login_at?: Date;
  deleted_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  stats?: UserStats;
}

export interface UpdateProfileDTO {
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_image?: string;
  notification_enabled?: boolean;
  location_enabled?: boolean;
}

export interface UpdateTransportModeDTO {
  transport_mode: TransportMode;
}

export interface UserFilterOptions {
  role?: string;
  status?: string;
  transport_mode?: string;
  search?: string;
  page?: number;
  limit?: number;
}

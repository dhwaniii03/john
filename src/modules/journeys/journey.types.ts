export type JourneyStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type TransportMode = 'DRIVER' | 'CYCLIST' | 'WALKER';

export interface JourneyWaypoint {
  latitude: number;
  longitude: number;
  name?: string;
  order?: number;
}

export interface Journey {
  id: number;
  user_id: number;
  user_name?: string;
  transport_mode: TransportMode;
  title?: string;
  origin_name?: string;
  destination_name?: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude?: number;
  end_longitude?: number;
  waypoints?: JourneyWaypoint[];
  distance_km?: number;
  duration_minutes?: number;
  avg_speed_kmh?: number;
  hazards_count?: number;
  cyclists_nearby?: number;
  walkers_nearby?: number;
  route_polyline?: string;
  status: JourneyStatus;
  started_at?: Date;
  last_on_route_at?: Date;
  ended_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface StartJourneyDTO {
  transport_mode?: TransportMode;
  title?: string;
  origin_name?: string;
  destination_name?: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude?: number;
  end_longitude?: number;
  route_polyline?: string;
  waypoints?: JourneyWaypoint[];
}

export interface EndJourneyDTO {
  end_latitude?: number;
  end_longitude?: number;
  distance_km?: number;
  duration_minutes?: number;
  avg_speed_kmh?: number;
  hazards_count?: number;
  cyclists_nearby?: number;
  walkers_nearby?: number;
  route_polyline?: string;
  status?: 'COMPLETED' | 'CANCELLED';
}

export interface JourneyFilterOptions {
  user_id?: number;
  status?: string;
  transport_mode?: string;
  page?: number;
  limit?: number;
}

export interface LiveLocation {
  id: number;
  user_id: number;
  user_name?: string;
  journey_id?: number;
  latitude: number;
  longitude: number;
  transport_mode: TransportMode;
  is_active: boolean;
  distance_km?: number;
  last_updated_at?: Date;
  created_at?: Date;
}

export interface UpdateLiveLocationDTO {
  journey_id?: number;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  transport_mode?: TransportMode;
}

export interface NearbyLocationOptions {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  transport_mode?: TransportMode;
  excludeUserId?: number;
  limit?: number;
}

export interface DriverAwarenessResult {
  hazards: any[];
  cyclists: LiveLocation[];
  walkers: LiveLocation[];
  summary: {
    hazardCount: number;
    cyclistCount: number;
    walkerCount: number;
  };
}

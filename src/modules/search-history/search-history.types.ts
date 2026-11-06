export interface SearchHistory {
  id: number;
  user_id: number;
  title: string;
  subtitle: string | null;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface FormattedSearchHistory {
  id: number;
  userId: number;
  title: string;
  subtitle: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSearchHistoryDTO {
  title: string;
  subtitle?: string | null;
  place_id?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SearchHistoryQueryDTO {
  limit?: number;
}


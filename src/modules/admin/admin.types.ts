export interface DashboardFilterOptions {
  period?: '7d' | '30d' | 'this_month' | 'last_month' | 'all';
  startDate?: string;
  endDate?: string;
}

export interface DashboardSummary {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalHazards: number;
  activeHazards: number;
  resolvedHazards: number;
  pendingReports: number;
  totalJourneys: number;
  activeJourneys: number;
  totalDatasetImports: number;
  // Dynamic percentage metrics
  usersChange?: string;
  usersChangeLabel?: string;
  usersIsPositive?: boolean;
  journeysChange?: string;
  journeysChangeLabel?: string;
  journeysIsPositive?: boolean;
  reportsChange?: string;
  reportsChangeLabel?: string;
  reportsIsPositive?: boolean;
  hazardsChange?: string;
  hazardsChangeLabel?: string;
  hazardsIsPositive?: boolean;
}

export interface HazardAnalytics {
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byCategory: { category_name: string; count: number }[];
  recentCreatedCount: number;
}

export interface UserAnalytics {
  totalUsers: number;
  byTransportMode: Record<string, number>;
  byStatus: Record<string, number>;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
}

export interface JourneyAnalytics {
  totalJourneys: number;
  byStatus: Record<string, number>;
  byTransportMode: Record<string, number>;
  totalDistanceKm: number;
  totalDurationMinutes: number;
}

export interface ReportAnalytics {
  totalReports: number;
  pendingReports: number;
  approvedReports: number;
  rejectedReports: number;
}

export interface ContentPage {
  id: number;
  slug: string;
  title: string;
  content: string;
  is_published: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateContentPageDTO {
  slug: string;
  title: string;
  content: string;
  is_published?: boolean;
}

export interface UpdateContentPageDTO {
  title?: string;
  content?: string;
  is_published?: boolean;
}

export interface SystemSetting {
  id: number;
  key: string;
  value: Record<string, any> | any;
  description?: string;
  updated_by?: number;
  updated_at?: Date;
}

export interface ActivityLog {
  id: number;
  actor_type: 'ADMIN' | 'USER' | 'SYSTEM';
  actor_id?: number;
  action: string;
  entity_type: string;
  entity_id?: number;
  metadata?: Record<string, any>;
  created_at?: Date;
}

export interface ActivityLogFilterOptions {
  actor_type?: string;
  actor_id?: number;
  entity_type?: string;
  action?: string;
  page?: number;
  limit?: number;
}

export interface DatasetImport {
  id: number;
  admin_id?: number;
  filename: string;
  file_size: number;
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  status: 'PENDING' | 'VALIDATED' | 'IMPORTED' | 'FAILED';
  error_summary?: any[];
  raw_preview?: any[];
  created_at?: Date;
  updated_at?: Date;
}

export interface DatasetRow {
  title: string;
  description?: string;
  category?: string;
  category_id?: number;
  latitude: number;
  longitude: number;
  severity?: string;
  status?: string;
  address?: string;
  image_url?: string;
}

export interface UploadDatasetDTO {
  filename: string;
  content: string; // CSV text or Base64
}

export interface AdminUserStatusDTO {
  status: 'ACTIVE' | 'SUSPENDED';
  role?: string;
}

export interface UserActivityTimelineItem {
  id: string;
  title: string;
  timestamp: string | Date;
  type: 'report' | 'journey' | 'approval' | 'join' | string;
  description?: string;
}

export interface AdminUserDetail {
  id: number | string;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  profile_image?: string;
  role: string;
  status: string;
  transport_mode: string;
  notification_enabled?: boolean;
  location_enabled?: boolean;
  last_login_at?: Date | string;
  created_at: Date | string;
  updated_at?: Date | string;
  journeysCompleted: number;
  totalJourneys: number;
  reportsSubmitted: number;
  reportsApproved: number;
  activityTimeline: UserActivityTimelineItem[];
}

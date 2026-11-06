export type NotificationType =
  | 'HAZARD_ALERT'
  | 'CYCLIST_ALERT'
  | 'WALKER_ALERT'
  | 'REPORT_STATUS'
  | 'SYSTEM'
  | 'hazard_alert'
  | 'journey_update'
  | 'system'
  | 'general';

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  read_at?: Date;
  is_read?: boolean;
  created_at?: Date;
}

export interface CreateNotificationDTO {
  user_id?: number;
  type?: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  audience?: string[] | any;
  targetAudience?: {
    modes?: string[];
    activeLast30DaysOnly?: boolean;
    region?: string;
  } | any;
  deliveryType?: string;
  status?: string;
  sendOn?: string;
  scheduledAt?: string;
  priority?: string;
  relatedHazardId?: string;
  relatedHazardTitle?: string;
}

export interface NotificationFilterOptions {
  user_id: number;
  isAdmin?: boolean;
  is_read?: boolean;
  type?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PushNotificationPayload {
  userId: number;
  title: string;
  body: string;
  data?: Record<string, any>;
}

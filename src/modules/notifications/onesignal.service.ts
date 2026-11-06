import type { PushNotificationPayload } from './notification.types.js';
import type { IPushNotificationService } from './notification.service.js';

export interface OneSignalBroadcastPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  audience?: string[]; // e.g. ['DRIVER', 'CYCLIST', 'WALKER']
  segments?: string[]; // e.g. ['Subscribed Users']
  url?: string;
}

export class OneSignalPushNotificationService implements IPushNotificationService {
  private readonly appId: string;
  private readonly restApiKey: string;
  private readonly apiUrl = 'https://onesignal.com/api/v1/notifications';

  constructor(
    appId: string = process.env.ONESIGNAL_APP_ID || '',
    restApiKey: string = process.env.ONESIGNAL_REST_API_KEY || ''
  ) {
    this.appId = appId;
    this.restApiKey = restApiKey;
  }

  private isConfigured(): boolean {
    return Boolean(
      this.appId &&
      this.restApiKey &&
      this.appId !== 'your_onesignal_app_id_here' &&
      this.restApiKey !== 'your_onesignal_rest_api_key_here'
    );
  }

  /**
   * Send direct push notification to a specific user identified by external_id (user ID)
   */
  async sendPush(payload: PushNotificationPayload): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn(
        `[OneSignal Service] Skipped push to user ${payload.userId}. ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY is not configured in .env.`
      );
      return false;
    }

    try {
      const body = {
        app_id: this.appId,
        include_aliases: {
          external_id: [String(payload.userId)],
        },
        target_channel: 'push',
        // Also include legacy external user ids array for backward compatibility
        include_external_user_ids: [String(payload.userId)],
        headings: {
          en: payload.title,
        },
        contents: {
          en: payload.body,
        },
        data: {
          ...payload.data,
          userId: payload.userId,
        },
        android_channel_id: 'roadlife_hazard_channel',
        priority: 10,
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Basic ${this.restApiKey}`,
        },
        body: JSON.stringify(body),
      });

      const responseData = (await response.json()) as any;

      if (!response.ok) {
        console.error('[OneSignal Service] Send push error response:', responseData);
        return false;
      }

      console.log(
        `[OneSignal Service] Successfully sent push to user ${payload.userId}. Notification ID: ${responseData.id || 'N/A'}`
      );
      return true;
    } catch (error) {
      console.error('[OneSignal Service] Network error sending push notification:', error);
      return false;
    }
  }

  /**
   * Broadcast push notification to filtered audience (e.g., transport modes) or all subscribed users
   */
  async broadcastPush(payload: OneSignalBroadcastPayload): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn(
        `[OneSignal Service] Skipped broadcast push ("${payload.title}"). ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY is not configured in .env.`
      );
      return false;
    }

    try {
      const body: Record<string, any> = {
        app_id: this.appId,
        headings: {
          en: payload.title,
        },
        contents: {
          en: payload.body,
        },
        data: payload.data || {},
        priority: 10,
      };

      // Filter by transport mode if specified
      if (payload.audience && payload.audience.length > 0) {
        const filters: any[] = [];
        payload.audience.forEach((mode, index) => {
          if (index > 0) {
            filters.push({ operator: 'OR' });
          }
          filters.push({
            field: 'tag',
            key: 'transport_mode',
            relation: '=',
            value: mode.toUpperCase(),
          });
        });
        body.filters = filters;
      } else {
        body.included_segments = payload.segments || ['Subscribed Users'];
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Basic ${this.restApiKey}`,
        },
        body: JSON.stringify(body),
      });

      const responseData = (await response.json()) as any;

      if (!response.ok) {
        console.error('[OneSignal Service] Broadcast push error response:', responseData);
        return false;
      }

      console.log(
        `[OneSignal Service] Successfully sent broadcast. Notification ID: ${responseData.id || 'N/A'}, Recipients: ${responseData.recipients ?? 'all'}`
      );
      return true;
    } catch (error) {
      console.error('[OneSignal Service] Network error broadcasting push notification:', error);
      return false;
    }
  }
}

export const oneSignalService = new OneSignalPushNotificationService();
export default oneSignalService;

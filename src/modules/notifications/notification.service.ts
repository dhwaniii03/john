import notificationRepository, { NotificationRepository } from './notification.repository.js';
import type {
  Notification,
  CreateNotificationDTO,
  NotificationFilterOptions,
  PushNotificationPayload,
} from './notification.types.js';
import { getPaginationMeta } from '../../utils/pagination.js';
import oneSignalService, { type OneSignalBroadcastPayload } from './onesignal.service.js';

export interface IPushNotificationService {
  sendPush(payload: PushNotificationPayload): Promise<boolean>;
  broadcastPush(payload: OneSignalBroadcastPayload): Promise<boolean>;
}

export class MockPushNotificationService implements IPushNotificationService {
  async sendPush(payload: PushNotificationPayload): Promise<boolean> {
    console.log(
      `[Push Notification Dispatch] To User ${payload.userId}: "${payload.title}" - "${payload.body}"`
    );
    return true;
  }

  async broadcastPush(payload: OneSignalBroadcastPayload): Promise<boolean> {
    console.log(
      `[Push Broadcast Dispatch] Audience: ${payload.audience?.join(', ') || 'All'}: "${payload.title}" - "${payload.body}"`
    );
    return true;
  }
}

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository = notificationRepository,
    private readonly pushService: IPushNotificationService = oneSignalService
  ) {}

  async createNotification(data: CreateNotificationDTO): Promise<Notification> {
    const audienceList: string[] =
      data.targetAudience?.modes ||
      data.audience ||
      (Array.isArray(data.data?.audience) ? data.data.audience : undefined) ||
      (Array.isArray(data.data?.target_modes) ? data.data.target_modes : undefined);

    let notification: Notification;

    if (audienceList && audienceList.length > 0) {
      // Create broadcast record and distribute to active users in database
      notification = await this.repo.createBroadcast(data, audienceList);
    } else {
      notification = await this.repo.create(data);
    }

    const isScheduled =
      data.deliveryType === 'schedule' ||
      data.status?.toLowerCase() === 'scheduled' ||
      data.data?.deliveryType === 'schedule';

    const isDraft =
      data.status?.toLowerCase() === 'draft' || data.data?.status?.toLowerCase() === 'draft';

    // Dispatch push notification immediately if broadcast is live ('Send Now')
    if (!isScheduled && !isDraft) {
      if (audienceList && audienceList.length > 0) {
        // Send broadcast push via OneSignal to all devices or targeted transport modes
        this.pushService
          .broadcastPush({
            title: data.title,
            body: data.message,
            audience: audienceList.length >= 3 ? undefined : audienceList,
            data: {
              ...(data.data || {}),
              screen: 'Alerts',
              notificationId: notification.id,
              type: data.type || 'SYSTEM',
            },
          })
          .catch((err) => console.error('[Push Service] Broadcast push failed to send:', err));
      } else if (data.user_id) {
        // Direct push notification to specific user
        this.pushService
          .sendPush({
            userId: data.user_id,
            title: data.title,
            body: data.message,
            data: {
              ...(data.data || {}),
              screen: 'Alerts',
              notificationId: notification.id,
              type: data.type || 'SYSTEM',
            },
          })
          .catch((err) => console.error('[Push Service] Direct push failed to send:', err));
      }
    }

    return notification;
  }

  async getNotifications(options: NotificationFilterOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));

    const { notifications, total, unreadCount } = await this.repo.findAll({
      ...options,
      page,
      limit,
    });
    const pagination = getPaginationMeta(total, page, limit);

    return { notifications, pagination, unreadCount };
  }

  async getNotificationById(
    id: string | number,
    userId?: number,
    isAdmin?: boolean
  ): Promise<Notification> {
    const notification = await this.repo.findById(id);
    if (!notification) {
      throw new Error('Notification not found');
    }
    // If regular user, ensure they own the notification
    if (!isAdmin && userId !== undefined && notification.user_id !== userId) {
      throw new Error('Notification not found or access denied');
    }
    return notification;
  }

  async updateNotification(
    id: string | number,
    data: Partial<CreateNotificationDTO> & Record<string, any>
  ): Promise<Notification> {
    const updated = await this.repo.update(id, data);
    if (!updated) {
      throw new Error('Notification not found');
    }
    return updated;
  }

  async markAsRead(id: string | number, userId: number): Promise<Notification> {
    const notification = await this.repo.markAsRead(id, userId);
    if (!notification) {
      throw new Error('Notification not found');
    }
    return notification;
  }

  async markAllAsRead(userId: number): Promise<{ updatedCount: number }> {
    const updatedCount = await this.repo.markAllAsRead(userId);
    return { updatedCount };
  }

  async deleteNotification(id: string | number, userId?: number, isAdmin?: boolean): Promise<void> {
    const deleted = await this.repo.delete(id, userId, isAdmin);
    if (!deleted) {
      throw new Error('Notification not found or already deleted');
    }
  }
}

export default new NotificationService();

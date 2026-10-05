import {
  NotificationCategoryType,
  NotificationChannel,
} from '../../notifications.constants';

export type NotificationAudience = 'patient' | 'clinic';

export interface NotificationSemanticAction {
  type: string;
  params: Record<string, string>;
  label?: string;
}

export interface NotificationIntent {
  recipientUserId: string;
  audience: NotificationAudience;
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  action?: NotificationSemanticAction;
  actions?: Array<{
    label: string;
    actionKey: string;
    actionType?: string;
    url?: string;
  }>;
  badgeIcon?: string;
  metaIcon?: string;
  visualKey?: string | null;
  senderName?: string;
  senderRole?: string;
  isUrgent?: boolean;
  presentation?: { toast: boolean };
}

export interface NotificationRule<TPayload = any> {
  eventType: string;
  defaultChannels: NotificationChannel[];
  category: NotificationCategoryType;
  resolveIntents?: (
    payload: TPayload,
    actor?: { userId?: string; roleCode?: string },
  ) => NotificationIntent[] | Promise<NotificationIntent[]>;
  resolveRecipients?: (
    payload: TPayload,
  ) => string | string[] | Promise<string | string[]>;
  titleTemplate?: string | ((payload: TPayload) => string);
  bodyTemplate?: string | ((payload: TPayload) => string);
  senderName?: string | ((payload: TPayload) => string);
  senderRole?: string | ((payload: TPayload) => string);
  badgeIcon?: string;
  metaIcon?: string;
  visualKey?: string | ((payload: TPayload) => string | undefined | null);
  isUrgent?: boolean | ((payload: TPayload) => boolean);
  resolveSource?: (payload: TPayload) => {
    sourceType: string;
    sourceId: string;
  };
  resolveActions?: (payload: TPayload) => Array<{
    label: string;
    actionKey: string;
    actionType?: string;
    url?: string;
  }>;
}

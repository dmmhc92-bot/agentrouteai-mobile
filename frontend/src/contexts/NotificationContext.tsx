/**
 * NotificationContext - Stub version without push notifications
 * Push notifications are disabled in this build.
 * This provides the same interface but uses local-only notifications.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../services/api';

interface NotificationPreferences {
  appointments: boolean;
  reminders: boolean;
  follow_ups: boolean;
  team_alerts: boolean;
  lead_alerts: boolean;
  push_enabled: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, any>;
  read: boolean;
  created_at: string;
  read_at?: string;
}

interface NotificationContextType {
  pushToken: string | null;
  notifications: NotificationItem[];
  unreadCount: number;
  preferences: NotificationPreferences;
  isLoading: boolean;
  registerForPushNotifications: () => Promise<void>;
  loadNotifications: () => Promise<void>;
  loadUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  loadPreferences: () => Promise<void>;
  sendTestNotification: () => Promise<void>;
}

const defaultPreferences: NotificationPreferences = {
  appointments: true,
  reminders: true,
  follow_ups: true,
  team_alerts: true,
  lead_alerts: true,
  push_enabled: false, // Disabled - no push in this build
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(false);

  // Load notifications when user changes
  useEffect(() => {
    if (user && token) {
      loadNotifications();
      loadUnreadCount();
      loadPreferences();
    }
  }, [user, token]);

  // Push notifications disabled - this is a no-op
  const registerForPushNotifications = async () => {
    console.log('[Notifications] Push notifications disabled in this build');
  };

  const loadNotifications = async () => {
    if (!token) return;
    
    setIsLoading(true);
    try {
      const response = await api.getNotifications();
      setNotifications(response.notifications || []);
    } catch (error) {
      console.warn('[Notifications] Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    if (!token) return;
    
    try {
      const response = await api.getUnreadNotificationCount();
      setUnreadCount(response.count || 0);
    } catch (error) {
      console.warn('[Notifications] Failed to load unread count');
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.markNotificationRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.warn('[Notifications] Failed to mark as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.warn('[Notifications] Failed to mark all as read');
    }
  };

  const loadPreferences = async () => {
    if (!token) return;
    
    try {
      const response = await api.getNotificationPreferences();
      if (response) {
        setPreferences({
          ...defaultPreferences,
          ...response,
          push_enabled: false, // Always false - push disabled
        });
      }
    } catch (error) {
      console.warn('[Notifications] Failed to load preferences');
    }
  };

  const updatePreferences = async (prefs: Partial<NotificationPreferences>) => {
    try {
      const newPrefs = { 
        ...preferences, 
        ...prefs,
        push_enabled: false, // Always false - push disabled
      };
      await api.updateNotificationPreferences(newPrefs);
      setPreferences(newPrefs);
    } catch (error) {
      console.warn('[Notifications] Failed to update preferences');
      throw error;
    }
  };

  // Test notification - no-op since push is disabled
  const sendTestNotification = async () => {
    console.log('[Notifications] Push notifications disabled - cannot send test');
  };

  return (
    <NotificationContext.Provider
      value={{
        pushToken,
        notifications,
        unreadCount,
        preferences,
        isLoading,
        registerForPushNotifications,
        loadNotifications,
        loadUnreadCount,
        markAsRead,
        markAllAsRead,
        updatePreferences,
        loadPreferences,
        sendTestNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

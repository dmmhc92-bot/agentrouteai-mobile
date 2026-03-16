import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
  push_enabled: true,
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, token } = useAuth();
  
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(false);

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const appState = useRef(AppState.currentState);

  // Register for push notifications
  const registerForPushNotifications = async () => {
    if (!Device.isDevice) {
      console.log('Must use physical device for push notifications');
      return;
    }

    try {
      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not already granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }

      // Get the token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'agentroute-ai', // This should match your Expo project ID
      });
      
      const expoPushToken = tokenData.data;
      setPushToken(expoPushToken);

      // Register token with backend
      if (token) {
        try {
          await api.registerPushToken(expoPushToken, Platform.OS);
          console.log('Push token registered with backend');
        } catch (error) {
          console.error('Failed to register push token with backend:', error);
        }
      }

      // Android-specific notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#3B82F6',
        });
      }
    } catch (error) {
      console.error('Error registering for push notifications:', error);
    }
  };

  // Handle notification deep linking
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    
    if (!data || !data.screen) {
      console.log('No deep link data in notification');
      return;
    }

    // Navigate based on notification type
    switch (data.screen) {
      case 'calendar':
        if (data.appointment_id) {
          router.push(`/appointment/${data.appointment_id}` as any);
        } else {
          router.push('/(tabs)/calendar');
        }
        break;
      
      case 'lead_detail':
        if (data.lead_id) {
          router.push(`/lead/${data.lead_id}` as any);
        } else {
          router.push('/(tabs)/leads');
        }
        break;
      
      case 'settings_team':
        router.push('/(tabs)/settings');
        break;
      
      case 'dashboard':
        router.push('/(tabs)/dashboard');
        break;
      
      case 'task':
        if (data.task_id) {
          // Navigate to task or related lead
          if (data.lead_id) {
            router.push(`/lead/${data.lead_id}` as any);
          }
        }
        break;
      
      default:
        console.log('Unknown notification screen:', data.screen);
    }

    // Mark notification as read if we have an ID
    if (data.notification_id) {
      markAsRead(data.notification_id);
    }
  };

  // Load notifications from backend
  const loadNotifications = async () => {
    if (!token) return;
    
    setIsLoading(true);
    try {
      const data = await api.getNotifications(50, false);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load just the unread count (for badge updates)
  const loadUnreadCount = async () => {
    if (!token) return;
    
    try {
      const data = await api.getUnreadNotificationCount();
      setUnreadCount(data.unread_count || 0);
      
      // Update badge
      await Notifications.setBadgeCountAsync(data.unread_count || 0);
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  };

  // Mark a notification as read
  const markAsRead = async (notificationId: string) => {
    if (!token) return;
    
    try {
      const data = await api.markNotificationRead(notificationId);
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(data.unread_count || 0);
      
      // Update badge
      await Notifications.setBadgeCountAsync(data.unread_count || 0);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    if (!token) return;
    
    try {
      await api.markAllNotificationsRead();
      
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      
      // Update badge
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  // Load preferences from backend
  const loadPreferences = async () => {
    if (!token) return;
    
    try {
      const data = await api.getNotificationPreferences();
      setPreferences(data.preferences || defaultPreferences);
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  };

  // Update preferences
  const updatePreferences = async (prefs: Partial<NotificationPreferences>) => {
    if (!token) return;
    
    const newPrefs = { ...preferences, ...prefs };
    
    try {
      await api.updateNotificationPreferences(newPrefs);
      setPreferences(newPrefs);
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      throw error;
    }
  };

  // Send test notification
  const sendTestNotification = async () => {
    if (!token) return;
    
    try {
      await api.sendTestNotification();
      // Reload notifications after sending test
      setTimeout(() => loadNotifications(), 1000);
    } catch (error) {
      console.error('Failed to send test notification:', error);
      throw error;
    }
  };

  // Set up notification listeners
  useEffect(() => {
    // Listener for incoming notifications when app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      // Reload unread count when we receive a notification
      loadUnreadCount();
    });

    // Listener for when user interacts with notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      handleNotificationResponse(response);
    });

    // Clean up
    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Handle app state changes to refresh unread count
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        token
      ) {
        // App came to foreground, refresh unread count
        loadUnreadCount();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [token]);

  // Initial load when user logs in
  useEffect(() => {
    if (token && user) {
      registerForPushNotifications();
      loadNotifications();
      loadPreferences();
    }
  }, [token, user]);

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

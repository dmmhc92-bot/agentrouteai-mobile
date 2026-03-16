import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../../src/contexts/NotificationContext';

interface PreferenceItemProps {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

function PreferenceItem({ icon, iconColor, title, description, value, onValueChange, disabled }: PreferenceItemProps) {
  return (
    <View style={[styles.preferenceItem, disabled && styles.preferenceDisabled]}>
      <View style={[styles.preferenceIconCircle, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <View style={styles.preferenceContent}>
        <Text style={styles.preferenceTitle}>{title}</Text>
        <Text style={styles.preferenceDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#334155', true: '#3B82F680' }}
        thumbColor={value ? '#3B82F6' : '#64748B'}
        ios_backgroundColor="#334155"
        disabled={disabled}
      />
    </View>
  );
}

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { 
    preferences, 
    updatePreferences, 
    loadPreferences,
    registerForPushNotifications,
    sendTestNotification,
    pushToken 
  } = useNotifications();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [localPrefs, setLocalPrefs] = useState(preferences);

  useEffect(() => {
    loadPreferences();
  }, []);

  useEffect(() => {
    setLocalPrefs(preferences);
  }, [preferences]);

  const handleToggle = async (key: keyof typeof preferences, value: boolean) => {
    const newPrefs = { ...localPrefs, [key]: value };
    setLocalPrefs(newPrefs);
    
    try {
      await updatePreferences({ [key]: value });
    } catch (error) {
      // Revert on error
      setLocalPrefs(preferences);
      Alert.alert('Error', 'Failed to update preference');
    }
  };

  const handleEnablePush = async () => {
    setIsLoading(true);
    try {
      await registerForPushNotifications();
      Alert.alert('Success', 'Push notifications enabled');
    } catch (error) {
      Alert.alert('Error', 'Failed to enable push notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTestNotification = async () => {
    setIsSendingTest(true);
    try {
      await sendTestNotification();
      Alert.alert('Test Sent', 'A test notification has been sent. Check your notification center.');
    } catch (error) {
      Alert.alert('Error', 'Failed to send test notification');
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Push Notification Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Push Notifications</Text>
          <View style={styles.pushStatusCard}>
            <View style={styles.pushStatusHeader}>
              <View style={[
                styles.statusIndicator, 
                { backgroundColor: pushToken ? '#22C55E' : '#EF4444' }
              ]} />
              <View style={styles.pushStatusInfo}>
                <Text style={styles.pushStatusTitle}>
                  {pushToken ? 'Enabled' : 'Disabled'}
                </Text>
                <Text style={styles.pushStatusDescription}>
                  {pushToken 
                    ? 'You will receive push notifications'
                    : 'Enable to receive notifications when app is closed'
                  }
                </Text>
              </View>
            </View>
            
            {!pushToken && (
              <TouchableOpacity
                style={styles.enableButton}
                onPress={handleEnablePush}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="notifications" size={18} color="#FFFFFF" />
                    <Text style={styles.enableButtonText}>Enable Push Notifications</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Master Switch */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Master Control</Text>
          <View style={styles.card}>
            <PreferenceItem
              icon="notifications"
              iconColor="#3B82F6"
              title="All Notifications"
              description="Enable or disable all notification types"
              value={localPrefs.push_enabled}
              onValueChange={(value) => handleToggle('push_enabled', value)}
            />
          </View>
        </View>

        {/* Notification Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Categories</Text>
          <View style={styles.card}>
            <PreferenceItem
              icon="calendar"
              iconColor="#22C55E"
              title="Appointments"
              description="Reminders for upcoming appointments"
              value={localPrefs.appointments}
              onValueChange={(value) => handleToggle('appointments', value)}
              disabled={!localPrefs.push_enabled}
            />
            
            <View style={styles.separator} />
            
            <PreferenceItem
              icon="alarm"
              iconColor="#F59E0B"
              title="Reminders"
              description="Task and activity reminders"
              value={localPrefs.reminders}
              onValueChange={(value) => handleToggle('reminders', value)}
              disabled={!localPrefs.push_enabled}
            />
            
            <View style={styles.separator} />
            
            <PreferenceItem
              icon="refresh"
              iconColor="#8B5CF6"
              title="Follow-ups"
              description="Lead follow-up reminders"
              value={localPrefs.follow_ups}
              onValueChange={(value) => handleToggle('follow_ups', value)}
              disabled={!localPrefs.push_enabled}
            />
            
            <View style={styles.separator} />
            
            <PreferenceItem
              icon="people"
              iconColor="#EC4899"
              title="Team Alerts"
              description="Team invitations and updates"
              value={localPrefs.team_alerts}
              onValueChange={(value) => handleToggle('team_alerts', value)}
              disabled={!localPrefs.push_enabled}
            />
            
            <View style={styles.separator} />
            
            <PreferenceItem
              icon="person-add"
              iconColor="#06B6D4"
              title="Lead Alerts"
              description="New lead assignments and updates"
              value={localPrefs.lead_alerts}
              onValueChange={(value) => handleToggle('lead_alerts', value)}
              disabled={!localPrefs.push_enabled}
            />
          </View>
        </View>

        {/* Test Notification */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Testing</Text>
          <TouchableOpacity
            style={styles.testButton}
            onPress={handleSendTestNotification}
            disabled={isSendingTest}
          >
            {isSendingTest ? (
              <ActivityIndicator color="#3B82F6" size="small" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={20} color="#3B82F6" />
                <Text style={styles.testButtonText}>Send Test Notification</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Ionicons name="information-circle-outline" size={18} color="#64748B" />
          <Text style={styles.infoText}>
            Push notifications require your permission and may be affected by your device's Do Not Disturb settings.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    overflow: 'hidden',
  },
  pushStatusCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
  },
  pushStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  pushStatusInfo: {
    flex: 1,
  },
  pushStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pushStatusDescription: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
    gap: 8,
  },
  enableButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  preferenceDisabled: {
    opacity: 0.5,
  },
  preferenceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  preferenceContent: {
    flex: 1,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  preferenceDescription: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#334155',
    marginLeft: 72,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  testButtonText: {
    color: '#3B82F6',
    fontSize: 15,
    fontWeight: '600',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
});

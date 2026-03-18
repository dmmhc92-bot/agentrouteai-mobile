/**
 * Notification Preferences Screen - Stub version without push notifications
 * Push notifications are disabled in this build.
 */

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
  } = useNotifications();
  
  const [isLoading, setIsLoading] = useState(false);
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Push Notifications Status */}
        <View style={styles.section}>
          <View style={styles.pushStatusCard}>
            <View style={styles.pushStatusHeader}>
              <View style={[styles.statusIndicator, styles.statusDisabled]} />
              <Text style={styles.pushStatusTitle}>Push Notifications</Text>
            </View>
            <Text style={styles.pushStatusMessage}>
              Push notifications are not available in this version.
            </Text>
            <Text style={styles.pushStatusSubtext}>
              In-app notification preferences below will still be saved to your account.
            </Text>
          </View>
        </View>

        {/* In-App Notification Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>In-App Notifications</Text>
          <Text style={styles.sectionDescription}>
            Configure which types of notifications you receive within the app
          </Text>
          
          <View style={styles.preferencesCard}>
            <PreferenceItem
              icon="calendar"
              iconColor="#3B82F6"
              title="Appointments"
              description="Reminders for upcoming appointments"
              value={localPrefs.appointments}
              onValueChange={(value) => handleToggle('appointments', value)}
            />
            
            <PreferenceItem
              icon="alarm"
              iconColor="#8B5CF6"
              title="Task Reminders"
              description="Reminders for tasks and deadlines"
              value={localPrefs.reminders}
              onValueChange={(value) => handleToggle('reminders', value)}
            />
            
            <PreferenceItem
              icon="refresh"
              iconColor="#F59E0B"
              title="Follow-up Alerts"
              description="Notifications for lead follow-ups"
              value={localPrefs.follow_ups}
              onValueChange={(value) => handleToggle('follow_ups', value)}
            />
            
            <PreferenceItem
              icon="people"
              iconColor="#10B981"
              title="Team Updates"
              description="Activity from your team members"
              value={localPrefs.team_alerts}
              onValueChange={(value) => handleToggle('team_alerts', value)}
            />
            
            <PreferenceItem
              icon="person-add"
              iconColor="#EC4899"
              title="Lead Alerts"
              description="New lead assignments and updates"
              value={localPrefs.lead_alerts}
              onValueChange={(value) => handleToggle('lead_alerts', value)}
            />
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Ionicons name="information-circle-outline" size={20} color="#64748B" />
          <Text style={styles.infoText}>
            These preferences control in-app notification behavior. Push notifications 
            will be available in a future update.
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
  },
  pushStatusCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pushStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusDisabled: {
    backgroundColor: '#64748B',
  },
  pushStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pushStatusMessage: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  pushStatusSubtext: {
    fontSize: 13,
    color: '#64748B',
  },
  preferencesCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  preferenceDisabled: {
    opacity: 0.5,
  },
  preferenceIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  preferenceContent: {
    flex: 1,
    marginRight: 12,
  },
  preferenceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  preferenceDescription: {
    fontSize: 13,
    color: '#94A3B8',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#94A3B8',
    marginLeft: 12,
    lineHeight: 18,
  },
});

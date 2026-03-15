import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { format } from 'date-fns';

// Constants
const PRIVACY_POLICY_URL = 'https://agentroute-ai.preview.emergentagent.com/api/privacy-policy';
const TERMS_OF_SERVICE_URL = 'https://agentroute-ai.preview.emergentagent.com/api/terms-of-service';
const SUPPORT_EMAIL = 'agentrouteai@gmail.com';
const SUPPORT_SUBJECT = 'AgentRoute Support Request';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const [subscription, setSubscription] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const data = await api.getSubscriptionStatus();
      setSubscription(data);
    } catch (error) {
      console.log('Error loading subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ]);
  };

  const handleSubscribe = async () => {
    try {
      await api.subscribe();
      Alert.alert('Success', 'Subscription activated (mock)');
      loadSubscription();
    } catch (error) {
      Alert.alert('Error', 'Failed to subscribe');
    }
  };

  const handleRestore = async () => {
    try {
      const result = await api.restorePurchases();
      Alert.alert('Restore', result.message);
    } catch (error) {
      Alert.alert('Error', 'Failed to restore purchases');
    }
  };

  // Privacy Policy - Opens in browser/WebView
  const handlePrivacyPolicy = async () => {
    try {
      const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL);
      if (supported) {
        await Linking.openURL(PRIVACY_POLICY_URL);
      } else {
        Alert.alert('Error', 'Unable to open Privacy Policy. Please visit our website.');
      }
    } catch (error) {
      console.error('Error opening Privacy Policy:', error);
      Alert.alert('Error', 'Failed to open Privacy Policy');
    }
  };

  // Terms of Service - Opens in browser/WebView
  const handleTermsOfService = async () => {
    try {
      const supported = await Linking.canOpenURL(TERMS_OF_SERVICE_URL);
      if (supported) {
        await Linking.openURL(TERMS_OF_SERVICE_URL);
      } else {
        Alert.alert('Error', 'Unable to open Terms of Service. Please visit our website.');
      }
    } catch (error) {
      console.error('Error opening Terms of Service:', error);
      Alert.alert('Error', 'Failed to open Terms of Service');
    }
  };

  // Delete Account - Real deletion with confirmation
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone. All your data including leads, appointments, and documents will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => confirmDeleteAccount(),
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await api.deleteAccount();
      Alert.alert(
        'Account Deleted',
        'Your account has been permanently deleted.',
        [
          {
            text: 'OK',
            onPress: async () => {
              await signOut();
              router.replace('/');
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error deleting account:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to delete account. Please try again or contact support.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Contact Support - Opens email composer
  const handleContactSupport = async () => {
    const subject = encodeURIComponent(SUPPORT_SUBJECT);
    const body = encodeURIComponent(`\n\n---\nUser: ${user?.name || 'Unknown'}\nEmail: ${user?.email || 'Unknown'}\nApp Version: 1.0.0`);
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    try {
      const supported = await Linking.canOpenURL(mailtoUrl);
      if (supported) {
        await Linking.openURL(mailtoUrl);
      } else {
        // Fallback: copy email to clipboard or show email address
        Alert.alert(
          'Contact Support',
          `Please send an email to:\n${SUPPORT_EMAIL}\n\nSubject: ${SUPPORT_SUBJECT}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error opening email:', error);
      Alert.alert(
        'Contact Support',
        `Please send an email to:\n${SUPPORT_EMAIL}\n\nSubject: ${SUPPORT_SUBJECT}`
      );
    }
  };

  const getSubscriptionBadgeColor = () => {
    switch (subscription?.status) {
      case 'active':
        return '#22C55E';
      case 'trial':
        return '#3B82F6';
      default:
        return '#EF4444';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Profile Section */}
        <View style={styles.section}>
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitial}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.subscriptionCard}>
            {isLoading ? (
              <ActivityIndicator color="#3B82F6" />
            ) : (
              <>
                <View style={styles.subscriptionHeader}>
                  <View>
                    <Text style={styles.subscriptionPlan}>
                      {subscription?.plan === 'monthly' ? 'Monthly Plan' : 'Free Trial'}
                    </Text>
                    <View
                      style={[
                        styles.subscriptionBadge,
                        { backgroundColor: getSubscriptionBadgeColor() + '20' },
                      ]}
                    >
                      <Text
                        style={[styles.subscriptionStatus, { color: getSubscriptionBadgeColor() }]}
                      >
                        {subscription?.status?.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.subscriptionPrice}>$30/mo</Text>
                </View>
                {subscription?.is_trial && subscription?.expires_at && (
                  <Text style={styles.trialExpires}>
                    Trial expires: {format(new Date(subscription.expires_at), 'MMM d, yyyy')}
                  </Text>
                )}
                {subscription?.status !== 'active' && (
                  <TouchableOpacity style={styles.subscribeButton} onPress={handleSubscribe}>
                    <Text style={styles.subscribeButtonText}>Subscribe Now</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
                  <Text style={styles.restoreButtonText}>Restore Purchases</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.menuCard}>
            <MenuItem
              icon="person-outline"
              title="Edit Profile"
              onPress={() => Alert.alert('Coming Soon', 'Profile editing coming soon')}
            />
            <MenuItem
              icon="notifications-outline"
              title="Notifications"
              onPress={() => Alert.alert('Coming Soon', 'Notification settings coming soon')}
            />
            <MenuItem
              icon="shield-outline"
              title="Privacy & Security"
              onPress={() => Alert.alert('Coming Soon', 'Privacy settings coming soon')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.menuCard}>
            <MenuItem
              icon="mail-outline"
              title="Contact Support"
              onPress={handleContactSupport}
            />
            <MenuItem
              icon="document-text-outline"
              title="Privacy Policy"
              onPress={handlePrivacyPolicy}
            />
            <MenuItem
              icon="help-circle-outline"
              title="Help Center"
              onPress={() => Alert.alert('Coming Soon', 'Help center coming soon')}
            />
          </View>
        </View>

        {/* Delete Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
          <TouchableOpacity 
            style={styles.deleteAccountButton} 
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount}
          >
            {isDeletingAccount ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text style={styles.deleteAccountText}>Delete Account</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function MenuItem({
  icon,
  title,
  onPress,
}: {
  icon: string;
  title: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuItemLeft}>
        <Ionicons name={icon as any} size={22} color="#94A3B8" />
        <Text style={styles.menuItemText}>{title}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#64748B" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
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
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileInitial: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileEmail: {
    color: '#94A3B8',
    fontSize: 14,
  },
  subscriptionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  subscriptionPlan: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  subscriptionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  subscriptionStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  subscriptionPrice: {
    color: '#3B82F6',
    fontSize: 24,
    fontWeight: 'bold',
  },
  trialExpires: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 16,
  },
  subscribeButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: '#3B82F6',
    fontSize: 14,
  },
  menuCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    color: '#E2E8F0',
    fontSize: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
    marginTop: 8,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  deleteAccountText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
});

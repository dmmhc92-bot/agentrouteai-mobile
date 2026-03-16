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
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { format } from 'date-fns';
import Constants from 'expo-constants';

// Constants - Use environment variable for base URL
const BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                 process.env.EXPO_PUBLIC_BACKEND_URL || 
                 'https://sales-team-hub-2.preview.emergentagent.com';
const PRIVACY_POLICY_URL = `${BASE_URL}/api/privacy`;
const TERMS_OF_SERVICE_URL = `${BASE_URL}/api/terms`;
const SUPPORT_EMAIL = 'agentrouteai@gmail.com';
const SUPPORT_SUBJECT = 'AgentRoute Support Request';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut, isAdmin, isManager, canInviteUsers, isSoloMode, isConnectedMode, teamInfo, joinTeam, leaveTeam, refreshUser } = useAuth();

  const [subscription, setSubscription] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  
  // Account Mode state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [inviteValidation, setInviteValidation] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

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

  // Account Mode handlers
  const handleValidateInvite = async () => {
    if (!inviteToken.trim()) {
      Alert.alert('Error', 'Please enter an invitation token');
      return;
    }
    
    setIsValidating(true);
    try {
      const validation = await api.validateInviteForJoin(inviteToken.trim());
      setInviteValidation(validation);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Invalid or expired invitation';
      Alert.alert('Invalid Token', message);
      setInviteValidation(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleJoinTeam = async () => {
    if (!inviteToken.trim()) {
      Alert.alert('Error', 'Please enter an invitation token');
      return;
    }
    
    setIsJoining(true);
    try {
      await joinTeam(inviteToken.trim());
      setShowJoinModal(false);
      setInviteToken('');
      setInviteValidation(null);
      Alert.alert('Success', 'You have successfully joined the team!');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to join team';
      Alert.alert('Error', message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveTeam = async () => {
    setIsLeaving(true);
    try {
      await leaveTeam();
      setShowLeaveModal(false);
      Alert.alert('Success', 'You have returned to solo mode. All your personal records remain with you.');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to leave team';
      Alert.alert('Error', message);
    } finally {
      setIsLeaving(false);
    }
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

  // Privacy Policy - Opens in-app WebView
  const handlePrivacyPolicy = () => {
    router.push('/legal/privacy');
  };

  // Terms of Service - Opens in-app WebView
  const handleTermsOfService = () => {
    router.push('/legal/terms');
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
              <View style={styles.roleContainer}>
                <View style={[
                  styles.roleBadge, 
                  { backgroundColor: isAdmin ? '#3B82F620' : isManager ? '#8B5CF620' : '#22C55E20' }
                ]}>
                  <Text style={[
                    styles.roleText,
                    { color: isAdmin ? '#3B82F6' : isManager ? '#8B5CF6' : '#22C55E' }
                  ]}>
                    {isAdmin ? 'Admin' : isManager ? 'Manager' : isSoloMode ? 'Solo Agent' : 'Team Agent'}
                  </Text>
                </View>
              </View>
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

        {/* Team Management Section - Only for Admin/Manager */}
        {canInviteUsers && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team Management</Text>
            <View style={styles.menuCard}>
              <MenuItem
                icon="people-outline"
                title="Manage Team"
                subtitle={isAdmin ? "Users, invitations, approvals" : "Agents & invitations"}
                onPress={() => router.push('/team-management')}
              />
              <MenuItem
                icon="git-network-outline"
                title="Team Hierarchy"
                subtitle="View organization tree"
                onPress={() => router.push('/team-tree')}
              />
            </View>
          </View>
        )}

        {/* Account Mode Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Mode</Text>
          <View style={styles.menuCard}>
            <View style={styles.accountModeStatus}>
              <View style={styles.accountModeHeader}>
                <View style={[
                  styles.modeIndicator,
                  { backgroundColor: isConnectedMode ? '#22C55E' : '#64748B' }
                ]}>
                  <Ionicons 
                    name={isConnectedMode ? 'people' : 'person'} 
                    size={16} 
                    color="#FFFFFF" 
                  />
                </View>
                <View style={styles.modeInfo}>
                  <Text style={styles.modeLabel}>Current Mode</Text>
                  <Text style={styles.modeValue}>
                    {isConnectedMode ? 'Connected to Team' : 'Solo Mode'}
                  </Text>
                </View>
              </View>
              
              {isConnectedMode && teamInfo && (
                <View style={styles.teamDetails}>
                  <View style={styles.teamDetailRow}>
                    <Ionicons name="business-outline" size={16} color="#64748B" />
                    <Text style={styles.teamDetailText}>
                      {teamInfo.organization_name || 'Team'}
                    </Text>
                  </View>
                  {teamInfo.upline_name && (
                    <View style={styles.teamDetailRow}>
                      <Ionicons name="arrow-up-outline" size={16} color="#64748B" />
                      <Text style={styles.teamDetailText}>
                        Upline: {teamInfo.upline_name}
                      </Text>
                    </View>
                  )}
                  <View style={styles.teamDetailRow}>
                    <Ionicons name="shield-checkmark-outline" size={16} color="#64748B" />
                    <Text style={styles.teamDetailText}>
                      Role: {(user?.role || 'agent').charAt(0).toUpperCase() + (user?.role || 'agent').slice(1)}
                    </Text>
                  </View>
                </View>
              )}
              
              {!isConnectedMode && (
                <Text style={styles.modeDescription}>
                  You're working independently. Join a team to collaborate with other agents.
                </Text>
              )}
            </View>
            
            {/* Show appropriate button based on mode */}
            {isSoloMode ? (
              <TouchableOpacity 
                style={styles.joinTeamButton}
                onPress={() => setShowJoinModal(true)}
              >
                <Ionicons name="enter-outline" size={20} color="#FFFFFF" />
                <Text style={styles.joinTeamButtonText}>Join Team / Connect to Upline</Text>
              </TouchableOpacity>
            ) : (
              // Only show leave button if not admin of own org
              !(isAdmin && user?.admin_id === user?.id) && (
                <TouchableOpacity 
                  style={styles.leaveTeamButton}
                  onPress={() => setShowLeaveModal(true)}
                >
                  <Ionicons name="exit-outline" size={20} color="#EF4444" />
                  <Text style={styles.leaveTeamButtonText}>Leave Team / Return to Solo</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.menuCard}>
            <MenuItem
              icon="notifications-outline"
              title="Notification Preferences"
              subtitle="Manage alerts and reminders"
              onPress={() => router.push('/notifications/preferences')}
            />
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal & Support</Text>
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
              icon="reader-outline"
              title="Terms of Service"
              onPress={handleTermsOfService}
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

      {/* Join Team Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowJoinModal(false);
          setInviteToken('');
          setInviteValidation(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join Team</Text>
              <TouchableOpacity onPress={() => {
                setShowJoinModal(false);
                setInviteToken('');
                setInviteValidation(null);
              }}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Enter the invitation token provided by your team admin or manager to join their organization.
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons name="key-outline" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Enter invitation token"
                placeholderTextColor="#64748B"
                value={inviteToken}
                onChangeText={(text) => {
                  setInviteToken(text);
                  setInviteValidation(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {inviteToken.length > 0 && (
                <TouchableOpacity onPress={handleValidateInvite} disabled={isValidating}>
                  {isValidating ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              )}
            </View>

            {inviteValidation && (
              <View style={styles.validationSuccess}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <View style={styles.validationInfo}>
                  <Text style={styles.validationTitle}>
                    Valid Invitation
                  </Text>
                  <Text style={styles.validationText}>
                    Join as {inviteValidation.role} in {inviteValidation.organization_name}
                  </Text>
                  <Text style={styles.validationSubtext}>
                    Invited by {inviteValidation.invited_by_name}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.joinButton, (!inviteValidation || isJoining) && styles.buttonDisabled]}
              onPress={handleJoinTeam}
              disabled={!inviteValidation || isJoining}
            >
              {isJoining ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.joinButtonText}>Join Team</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.modalNote}>
              You can change your team affiliation later from this settings screen.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Leave Team Modal */}
      <Modal
        visible={showLeaveModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowLeaveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Leave Team</Text>
              <TouchableOpacity onPress={() => setShowLeaveModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.warningBanner}>
              <Ionicons name="alert-circle" size={24} color="#F59E0B" />
              <Text style={styles.warningText}>
                Are you sure you want to leave this team?
              </Text>
            </View>

            <View style={styles.leaveInfo}>
              <View style={styles.leaveInfoItem}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                <Text style={styles.leaveInfoText}>Your account will remain active</Text>
              </View>
              <View style={styles.leaveInfoItem}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                <Text style={styles.leaveInfoText}>Your personal leads and records stay with you</Text>
              </View>
              <View style={styles.leaveInfoItem}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                <Text style={styles.leaveInfoText}>You'll switch to Solo Mode</Text>
              </View>
              <View style={styles.leaveInfoItem}>
                <Ionicons name="close-circle" size={18} color="#EF4444" />
                <Text style={styles.leaveInfoText}>Your team will lose access to your records</Text>
              </View>
            </View>

            <View style={styles.leaveButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowLeaveModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.leaveConfirmButton, isLeaving && styles.buttonDisabled]}
                onPress={handleLeaveTeam}
                disabled={isLeaving}
              >
                {isLeaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.leaveConfirmButtonText}>Leave Team</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuItemLeft}>
        <Ionicons name={icon as any} size={22} color="#94A3B8" />
        <View style={styles.menuItemTextContainer}>
          <Text style={styles.menuItemText}>{title}</Text>
          {subtitle && <Text style={styles.menuItemSubtitle}>{subtitle}</Text>}
        </View>
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
  menuItemTextContainer: {
    flex: 1,
  },
  menuItemText: {
    color: '#E2E8F0',
    fontSize: 16,
  },
  menuItemSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
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
  // Account Mode styles
  accountModeStatus: {
    padding: 16,
  },
  accountModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modeIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeInfo: {
    flex: 1,
  },
  modeLabel: {
    color: '#64748B',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  modeValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  teamDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 8,
  },
  teamDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamDetailText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  modeDescription: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 12,
    lineHeight: 20,
  },
  joinTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  joinTeamButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  leaveTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  leaveTeamButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  modalDescription: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  validationSuccess: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#22C55E20',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  validationInfo: {
    flex: 1,
  },
  validationTitle: {
    color: '#22C55E',
    fontSize: 15,
    fontWeight: '600',
  },
  validationText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 4,
  },
  validationSubtext: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  joinButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modalNote: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B20',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    color: '#F59E0B',
    fontSize: 15,
    fontWeight: '500',
  },
  leaveInfo: {
    gap: 12,
    marginBottom: 24,
  },
  leaveInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  leaveInfoText: {
    color: '#E2E8F0',
    fontSize: 14,
  },
  leaveButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  leaveConfirmButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  leaveConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

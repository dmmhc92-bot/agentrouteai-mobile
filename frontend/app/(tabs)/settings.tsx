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
  Image,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAppLock } from '../../src/contexts/AppLockContext';
import { useSubscription } from '../../src/contexts/SubscriptionContext';
import { api } from '../../src/services/api';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

// Constants - Use environment variable for base URL
const getBaseUrl = () => {
  const extraUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL;
  if (extraUrl) return extraUrl;
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
};
const BASE_URL = getBaseUrl();
const PRIVACY_POLICY_URL = `${BASE_URL}/api/privacy`;
const TERMS_OF_SERVICE_URL = `${BASE_URL}/api/terms`;
const SUPPORT_EMAIL = 'agentrouteai@gmail.com';
const SUPPORT_SUBJECT = 'AgentRoute Support Request';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut, isAdmin, isManager, canInviteUsers, isSoloMode, isConnectedMode, teamInfo, joinTeam, leaveTeam, refreshUser, updateProfile } = useAuth();
  const { 
    isAppLockEnabled, 
    isBiometricAvailable, 
    biometricType, 
    enableAppLock, 
    disableAppLock 
  } = useAppLock();
  const {
    isPremium,
    isLoading: isSubscriptionLoading,
    subscriptionStatus,
    monthlyPackage,
    restorePurchases,
  } = useSubscription();

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isTogglingAppLock, setIsTogglingAppLock] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  
  // Profile Image state
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  
  // Account Mode state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [inviteValidation, setInviteValidation] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Profile Image handlers
  const handleProfileImagePress = () => {
    setShowImageOptions(true);
  };

  const pickImage = async () => {
    setShowImageOptions(false);
    
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const takePhoto = async () => {
    setShowImageOptions(false);
    
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow camera access to take a profile picture.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const uploadImage = async (uri: string) => {
    setIsUploadingImage(true);
    
    try {
      // Resize and compress image for mobile performance
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 400, height: 400 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        throw new Error('Failed to process image');
      }

      // Upload via API
      const imageData = `data:image/jpeg;base64,${manipulated.base64}`;
      await api.uploadProfileImage(imageData);
      
      // Refresh user data to get updated profile_image
      await refreshUser();
      
      Alert.alert('Success', 'Profile picture updated successfully!');
    } catch (error: any) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', error?.message || 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const removeProfileImage = async () => {
    setShowImageOptions(false);
    
    Alert.alert(
      'Remove Profile Picture',
      'Are you sure you want to remove your profile picture?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsUploadingImage(true);
            try {
              await api.deleteProfileImage();
              await refreshUser();
              Alert.alert('Success', 'Profile picture removed.');
            } catch (error: any) {
              console.error('Error removing image:', error);
              Alert.alert('Error', 'Failed to remove profile picture. Please try again.');
            } finally {
              setIsUploadingImage(false);
            }
          },
        },
      ]
    );
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

  // Subscription actions - Real Apple IAP with RevenueCat
  const handleSubscribe = () => {
    // Navigate to subscription/paywall screen
    router.push('/subscription');
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await restorePurchases();
    } finally {
      setIsRestoring(false);
    }
  };

  // Get subscription display info
  const getSubscriptionDisplay = () => {
    if (isSubscriptionLoading) {
      return {
        planName: 'Loading...',
        status: 'LOADING',
        statusColor: '#64748B',
        description: 'Checking subscription status...',
      };
    }
    
    if (isPremium) {
      return {
        planName: 'Premium',
        status: 'ACTIVE',
        statusColor: '#22C55E',
        description: subscriptionStatus?.expirationDate 
          ? `Renews ${new Date(subscriptionStatus.expirationDate).toLocaleDateString()}`
          : 'Full access to all premium features',
      };
    }
    
    // Get price from package if available
    const priceString = monthlyPackage?.product?.priceString || '$29.99/month';
    return {
      planName: 'Free',
      status: 'UPGRADE',
      statusColor: '#3B82F6',
      description: `Upgrade to Premium for ${priceString}`,
    };
  };

  const subscriptionDisplay = getSubscriptionDisplay();

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

  // App Lock toggle handler
  const handleToggleAppLock = async (value: boolean) => {
    setIsTogglingAppLock(true);
    try {
      if (value) {
        const success = await enableAppLock();
        if (!success) {
          Alert.alert(
            'Unable to Enable',
            'Biometric authentication could not be enabled. Please ensure you have Face ID or Touch ID set up on your device.'
          );
        }
      } else {
        await disableAppLock();
      }
    } catch (error) {
      console.warn('Error toggling app lock');
    } finally {
      setIsTogglingAppLock(false);
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
            <TouchableOpacity 
              style={styles.profileAvatarContainer}
              onPress={handleProfileImagePress}
              disabled={isUploadingImage}
            >
              {isUploadingImage ? (
                <View style={styles.profileAvatar}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                </View>
              ) : user?.profile_image ? (
                <Image 
                  source={{ uri: user.profile_image }} 
                  style={styles.profileImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileInitial}>
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={12} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
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

        {/* Subscription Section - Real Apple IAP */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <TouchableOpacity 
            style={styles.subscriptionCard}
            onPress={!isPremium ? handleSubscribe : undefined}
            activeOpacity={isPremium ? 1 : 0.7}
          >
            <View style={styles.subscriptionHeader}>
              <View style={styles.subscriptionInfo}>
                <View style={styles.subscriptionTitleRow}>
                  <Ionicons 
                    name={isPremium ? "star" : "star-outline"} 
                    size={20} 
                    color={isPremium ? "#F59E0B" : "#3B82F6"} 
                    style={styles.subscriptionIcon}
                  />
                  <Text style={styles.subscriptionPlan}>{subscriptionDisplay.planName}</Text>
                </View>
                <View
                  style={[
                    styles.subscriptionBadge,
                    { backgroundColor: `${subscriptionDisplay.statusColor}20` },
                  ]}
                >
                  <Text style={[styles.subscriptionStatus, { color: subscriptionDisplay.statusColor }]}>
                    {subscriptionDisplay.status}
                  </Text>
                </View>
              </View>
              {!isPremium && (
                <Ionicons name="chevron-forward" size={20} color="#64748B" />
              )}
            </View>
            <Text style={styles.trialExpires}>
              {subscriptionDisplay.description}
            </Text>
            
            {/* Upgrade/Manage Button */}
            {!isPremium && (
              <TouchableOpacity 
                style={styles.upgradeButton}
                onPress={handleSubscribe}
              >
                <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
              </TouchableOpacity>
            )}
            
            {/* Restore Purchases Button */}
            <TouchableOpacity 
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </View>

        {/* Team Management Section - Only for Admin/Manager */}
        {canInviteUsers && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team Management</Text>
            <View style={styles.menuCard}>
              <MenuItem
                icon="pulse-outline"
                title="Daily Command Center"
                subtitle="Team activity, needs attention, top performer"
                onPress={() => router.push('/manager-command-center')}
              />
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

        {/* Privacy & Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Security</Text>
          <View style={styles.menuCard}>
            {/* App Lock Toggle - Only show if biometric is available */}
            {isBiometricAvailable && (
              <View style={styles.appLockItem}>
                <View style={styles.appLockLeft}>
                  <Ionicons 
                    name={biometricType === 'Face ID' ? 'scan-outline' : 'finger-print-outline'} 
                    size={22} 
                    color="#94A3B8" 
                  />
                  <View style={styles.appLockTextContainer}>
                    <Text style={styles.menuItemText}>
                      {biometricType || 'Biometric'} Lock
                    </Text>
                    <Text style={styles.menuItemSubtitle}>
                      Require {biometricType || 'biometric'} after inactivity
                    </Text>
                  </View>
                </View>
                {isTogglingAppLock ? (
                  <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                  <Switch
                    value={isAppLockEnabled}
                    onValueChange={handleToggleAppLock}
                    trackColor={{ false: '#334155', true: '#3B82F6' }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#334155"
                  />
                )}
              </View>
            )}
            <MenuItem
              icon="map-outline"
              title="Route Privacy"
              subtitle="Control who can see your route"
              onPress={() => router.push('/route-settings/privacy')}
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

      {/* Profile Image Options Modal */}
      <Modal
        visible={showImageOptions}
        animationType="slide"
        transparent
        onRequestClose={() => setShowImageOptions(false)}
      >
        <TouchableOpacity 
          style={styles.imageOptionsOverlay}
          activeOpacity={1}
          onPress={() => setShowImageOptions(false)}
        >
          <View style={styles.imageOptionsContent}>
            <View style={styles.imageOptionsHeader}>
              <Text style={styles.imageOptionsTitle}>Profile Photo</Text>
              <TouchableOpacity onPress={() => setShowImageOptions(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.imageOption} onPress={takePhoto}>
              <View style={styles.imageOptionIcon}>
                <Ionicons name="camera" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.imageOptionText}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.imageOption} onPress={pickImage}>
              <View style={styles.imageOptionIcon}>
                <Ionicons name="images" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.imageOptionText}>Choose from Gallery</Text>
            </TouchableOpacity>

            {user?.profile_image && (
              <TouchableOpacity style={[styles.imageOption, styles.imageOptionRemove]} onPress={removeProfileImage}>
                <View style={[styles.imageOptionIcon, styles.imageOptionIconRemove]}>
                  <Ionicons name="trash" size={24} color="#EF4444" />
                </View>
                <Text style={[styles.imageOptionText, styles.imageOptionTextRemove]}>Remove Photo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={styles.imageOptionCancel} 
              onPress={() => setShowImageOptions(false)}
            >
              <Text style={styles.imageOptionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
  profileAvatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  profileAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#3B82F6',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  profileInitial: {
    color: '#FFFFFF',
    fontSize: 28,
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
  roleContainer: {
    marginTop: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  subscriptionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  subscriptionIcon: {
    marginRight: 8,
  },
  subscriptionPlan: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
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
  upgradeButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
  // Image Options Modal styles
  imageOptionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  imageOptionsContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  imageOptionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  imageOptionsTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  imageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  imageOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  imageOptionIconRemove: {
    backgroundColor: '#EF444420',
  },
  imageOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  imageOptionRemove: {
    borderBottomWidth: 0,
  },
  imageOptionTextRemove: {
    color: '#EF4444',
  },
  imageOptionCancel: {
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  imageOptionCancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // App Lock Toggle styles
  appLockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  appLockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  appLockTextContainer: {
    flex: 1,
  },
});

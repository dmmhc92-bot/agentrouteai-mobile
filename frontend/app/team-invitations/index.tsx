import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                 process.env.EXPO_PUBLIC_BACKEND_URL || 
                 'https://profile-photo-upload-2.preview.emergentagent.com';

interface Invitation {
  id: string;
  email?: string;
  name?: string;
  role: string;
  status: string;
  token?: string;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
}

type TabType = 'pending' | 'accepted' | 'expired';

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  accepted: '#22C55E',
  expired: '#94A3B8',
  cancelled: '#EF4444',
  revoked: '#EF4444',
};

const ROLE_COLORS: Record<string, string> = {
  manager: '#3B82F6',
  agent: '#22C55E',
};

export default function TeamInvitationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, isManager, user } = useAuth();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  
  // Create invite modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createRole, setCreateRole] = useState<'manager' | 'agent'>('agent');
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isAdmin || isManager) {
      loadInvitations();
    }
  }, [isAdmin, isManager]);

  const loadInvitations = async () => {
    try {
      const data = await api.getInvitations();
      setInvitations(data || []);
    } catch (error) {
      console.error('Failed to load invitations:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadInvitations();
  }, []);

  // Access control - moved after all hooks
  if (!isAdmin && !isManager) {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={styles.accessDeniedCard}>
          <Ionicons name="lock-closed" size={48} color="#EF4444" />
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedMessage}>
            Only Admins and Managers can manage team invitations.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const getFilteredInvitations = () => {
    const now = new Date();
    return invitations.filter(inv => {
      const isExpired = new Date(inv.expires_at) < now;
      
      switch (activeTab) {
        case 'pending':
          return inv.status === 'pending' && !isExpired;
        case 'accepted':
          return inv.status === 'accepted';
        case 'expired':
          return inv.status === 'expired' || inv.status === 'revoked' || inv.status === 'cancelled' || 
                 (inv.status === 'pending' && isExpired);
        default:
          return true;
      }
    });
  };

  const getInviteLink = (token: string) => {
    return `${BASE_URL}/invite/${token}`;
  };

  const handleCopyLink = async (token: string) => {
    try {
      await Clipboard.setStringAsync(getInviteLink(token));
      Alert.alert('Copied!', 'Invite link copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy link');
    }
  };

  const handleShareLink = async (invitation: Invitation) => {
    if (!invitation.token) return;
    
    try {
      await Share.share({
        message: `Join our team as ${invitation.role}!\n\n${getInviteLink(invitation.token)}`,
        title: 'Team Invitation',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleRevoke = (invitation: Invitation) => {
    Alert.alert(
      'Revoke Invitation',
      `Are you sure you want to revoke this invitation${invitation.email ? ` for ${invitation.email}` : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.revokeInvitation(invitation.id);
              loadInvitations();
              Alert.alert('Success', 'Invitation revoked');
            } catch (error) {
              Alert.alert('Error', 'Failed to revoke invitation');
            }
          },
        },
      ]
    );
  };

  const handleResend = async (invitation: Invitation) => {
    try {
      const result = await api.resendInvitation(invitation.id);
      loadInvitations();
      Alert.alert('Success', 'Invitation resent with new expiration date');
    } catch (error) {
      Alert.alert('Error', 'Failed to resend invitation');
    }
  };

  const handleCreateInvite = async () => {
    // Validate manager cannot create manager invites
    if (isManager && createRole === 'manager') {
      Alert.alert('Not Allowed', 'Managers can only create agent invitations');
      return;
    }

    setIsCreating(true);
    try {
      const response = await api.createInviteLink(
        createRole,
        createEmail.trim() || undefined,
        createName.trim() || undefined
      );
      
      setShowCreateModal(false);
      setCreateEmail('');
      setCreateName('');
      loadInvitations();
      
      // Show success with option to copy/share
      Alert.alert(
        'Invitation Created',
        `Invite link created for ${createRole}`,
        [
          { text: 'OK' },
          {
            text: 'Copy Link',
            onPress: () => handleCopyLink(response.token),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create invitation');
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`;
    
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes} min${minutes > 1 ? 's' : ''} left`;
  };

  const renderInvitationCard = (invitation: Invitation) => {
    const statusColor = STATUS_COLORS[invitation.status] || '#94A3B8';
    const roleColor = ROLE_COLORS[invitation.role] || '#3B82F6';
    const isPending = invitation.status === 'pending' && new Date(invitation.expires_at) > new Date();
    
    return (
      <View key={invitation.id} style={styles.invitationCard}>
        <View style={styles.invitationHeader}>
          <View style={[styles.roleBadge, { backgroundColor: `${roleColor}20` }]}>
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>
              {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
            </Text>
          </View>
        </View>

        <View style={styles.invitationContent}>
          {invitation.email ? (
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={16} color="#64748B" />
              <Text style={styles.infoText}>{invitation.email}</Text>
            </View>
          ) : (
            <View style={styles.infoRow}>
              <Ionicons name="link-outline" size={16} color="#64748B" />
              <Text style={styles.infoText}>Open Invite Link</Text>
            </View>
          )}
          
          {invitation.name && (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={16} color="#64748B" />
              <Text style={styles.infoText}>{invitation.name}</Text>
            </View>
          )}
          
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color="#64748B" />
            <Text style={styles.infoText}>
              {isPending ? getTimeRemaining(invitation.expires_at) : `Created ${formatDate(invitation.created_at)}`}
            </Text>
          </View>
        </View>

        {isPending && invitation.token && (
          <View style={styles.invitationActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleCopyLink(invitation.token!)}
            >
              <Ionicons name="copy-outline" size={18} color="#3B82F6" />
              <Text style={styles.actionButtonText}>Copy</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleShareLink(invitation)}
            >
              <Ionicons name="share-outline" size={18} color="#22C55E" />
              <Text style={[styles.actionButtonText, { color: '#22C55E' }]}>Share</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleResend(invitation)}
            >
              <Ionicons name="refresh-outline" size={18} color="#F59E0B" />
              <Text style={[styles.actionButtonText, { color: '#F59E0B' }]}>Resend</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleRevoke(invitation)}
            >
              <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Revoke</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const filteredInvitations = getFilteredInvitations();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Invitations</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {(['pending', 'accepted', 'expired'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#3B82F6"
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : filteredInvitations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="mail-outline" size={48} color="#475569" />
            <Text style={styles.emptyTitle}>No {activeTab} invitations</Text>
            <Text style={styles.emptyMessage}>
              {activeTab === 'pending'
                ? 'Create a new invitation to invite team members'
                : activeTab === 'accepted'
                ? 'Accepted invitations will appear here'
                : 'Expired and revoked invitations will appear here'}
            </Text>
            {activeTab === 'pending' && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setShowCreateModal(true)}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.emptyButtonText}>Create Invitation</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredInvitations.map(renderInvitationCard)
        )}
      </ScrollView>

      {/* Create Invitation Modal */}
      {showCreateModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Invitation</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {/* Role Selection */}
              <Text style={styles.inputLabel}>Role to Assign</Text>
              <View style={styles.roleSelector}>
                {isAdmin && (
                  <TouchableOpacity
                    style={[
                      styles.roleOption,
                      createRole === 'manager' && styles.roleOptionSelected,
                    ]}
                    onPress={() => setCreateRole('manager')}
                  >
                    <Ionicons
                      name="people"
                      size={20}
                      color={createRole === 'manager' ? '#3B82F6' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.roleOptionText,
                        createRole === 'manager' && styles.roleOptionTextSelected,
                      ]}
                    >
                      Manager
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    createRole === 'agent' && styles.roleOptionSelected,
                  ]}
                  onPress={() => setCreateRole('agent')}
                >
                  <Ionicons
                    name="person"
                    size={20}
                    color={createRole === 'agent' ? '#22C55E' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.roleOptionText,
                      createRole === 'agent' && styles.roleOptionTextSelected,
                    ]}
                  >
                    Agent
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Email (Optional) */}
              <Text style={styles.inputLabel}>Email (Optional)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Leave empty for open invite"
                  placeholderTextColor="#64748B"
                  value={createEmail}
                  onChangeText={setCreateEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Name (Optional) */}
              <Text style={styles.inputLabel}>Name (Optional)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Recipient's name"
                  placeholderTextColor="#64748B"
                  value={createName}
                  onChangeText={setCreateName}
                  autoCapitalize="words"
                />
              </View>

              <Text style={styles.hint}>
                {createEmail
                  ? 'This invite will only work for the specified email'
                  : 'This will create a shareable link anyone can use'}
              </Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isCreating && styles.buttonDisabled]}
                onPress={handleCreateInvite}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Create Invite</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  accessDeniedCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  accessDeniedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  accessDeniedMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerBackButton: {
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
  createButton: {
    width: 44,
    height: 44,
    backgroundColor: '#3B82F6',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#3B82F6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  invitationCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  invitationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  invitationContent: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  invitationActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButtonText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '500',
  },
  backButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  roleOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#3B82F620',
  },
  roleOptionText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  roleOptionTextSelected: {
    color: '#FFFFFF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  hint: {
    color: '#64748B',
    fontSize: 13,
    fontStyle: 'italic',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  cancelButtonText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '500',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});

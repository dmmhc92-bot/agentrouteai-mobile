import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  manager_id?: string;
  manager_name?: string;
  is_active: boolean;
  approval_status?: string;
  created_at: string;
  last_login?: string;
}

interface Invitation {
  id: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
  token?: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#8B5CF6',
  manager: '#3B82F6',
  agent: '#22C55E',
};

export default function TeamManagementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAdmin, isManager, canInviteUsers } = useAuth();

  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'pending'>('members');
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'agent'>('agent');
  const [isInviting, setIsInviting] = useState(false);

  // Action modal state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);

  const loadData = async () => {
    try {
      const [usersData, invitationsData] = await Promise.all([
        api.getUsers(),
        canInviteUsers ? api.getInvitations() : Promise.resolve([]),
      ]);
      setUsers(usersData);
      setInvitations(invitationsData.filter((inv: Invitation) => inv.status === 'pending'));

      if (isAdmin) {
        const pending = await api.getPendingUsers();
        setPendingUsers(pending);
      }
    } catch (error: any) {
      console.error('Error loading team data:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view team management');
        router.back();
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (canInviteUsers || isAdmin) {
        loadData();
      } else {
        setIsLoading(false);
      }
    }, [canInviteUsers, isAdmin])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    // Validate role permission
    if (isManager && inviteRole === 'manager') {
      Alert.alert('Error', 'Managers can only invite Agents');
      return;
    }

    setIsInviting(true);
    try {
      await api.createInvitation({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        name: inviteName.trim() || undefined,
      });
      
      Alert.alert('Success', `Invitation sent to ${inviteEmail}`);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('agent');
      loadData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to send invitation';
      Alert.alert('Error', message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    Alert.alert(
      'Cancel Invitation',
      'Are you sure you want to cancel this invitation?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelInvitation(inviteId);
              loadData();
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel invitation');
            }
          },
        },
      ]
    );
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      await api.resendInvitation(inviteId);
      Alert.alert('Success', 'Invitation resent');
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to resend invitation');
    }
  };

  const handleApproveUser = async (userId: string) => {
    try {
      await api.approveUser(userId);
      Alert.alert('Success', 'User approved');
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to approve user');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      `Are you sure you want to ${action} this user?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            try {
              await api.updateUserStatus(userId, !currentStatus);
              loadData();
              setShowActionModal(false);
            } catch (error) {
              Alert.alert('Error', `Failed to ${action} user`);
            }
          },
        },
      ]
    );
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    Alert.alert(
      'Change Role',
      `Change this user's role to ${newRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: async () => {
            try {
              await api.updateUserRole(userId, newRole);
              loadData();
              setShowActionModal(false);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to change role');
            }
          },
        },
      ]
    );
  };

  const renderUserCard = (member: User) => (
    <TouchableOpacity
      key={member.id}
      style={styles.memberCard}
      onPress={() => {
        if (isAdmin && member.id !== user?.id) {
          setSelectedUser(member);
          setShowActionModal(true);
        }
      }}
      activeOpacity={isAdmin ? 0.7 : 1}
    >
      <View style={[styles.memberAvatar, { backgroundColor: ROLE_COLORS[member.role] || '#64748B' }]}>
        <Ionicons
          name={member.role === 'admin' ? 'shield' : member.role === 'manager' ? 'people' : 'person'}
          size={20}
          color="#FFFFFF"
        />
      </View>
      <View style={styles.memberInfo}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName}>{member.name}</Text>
          {!member.is_active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          )}
        </View>
        <Text style={styles.memberEmail}>{member.email}</Text>
        <View style={styles.memberMeta}>
          <View style={[styles.roleBadge, { backgroundColor: `${ROLE_COLORS[member.role]}20` }]}>
            <Text style={[styles.roleBadgeText, { color: ROLE_COLORS[member.role] }]}>
              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
            </Text>
          </View>
          {member.manager_name && (
            <Text style={styles.managerText}>Reports to: {member.manager_name}</Text>
          )}
        </View>
      </View>
      {isAdmin && member.id !== user?.id && (
        <Ionicons name="chevron-forward" size={20} color="#64748B" />
      )}
    </TouchableOpacity>
  );

  const renderInvitationCard = (invite: Invitation) => (
    <View key={invite.id} style={styles.inviteCard}>
      <View style={styles.inviteInfo}>
        <Text style={styles.inviteEmail}>{invite.email}</Text>
        {invite.name && <Text style={styles.inviteName}>{invite.name}</Text>}
        <View style={styles.inviteMeta}>
          <View style={[styles.roleBadge, { backgroundColor: `${ROLE_COLORS[invite.role]}20` }]}>
            <Text style={[styles.roleBadgeText, { color: ROLE_COLORS[invite.role] }]}>
              {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
            </Text>
          </View>
          <Text style={styles.inviteDate}>
            Expires: {new Date(invite.expires_at).toLocaleDateString()}
          </Text>
        </View>
      </View>
      <View style={styles.inviteActions}>
        <TouchableOpacity
          style={styles.inviteActionBtn}
          onPress={() => handleResendInvite(invite.id)}
        >
          <Ionicons name="refresh" size={18} color="#3B82F6" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.inviteActionBtn}
          onPress={() => handleCancelInvite(invite.id)}
        >
          <Ionicons name="close-circle" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPendingUserCard = (pendingUser: User) => (
    <View key={pendingUser.id} style={styles.pendingCard}>
      <View style={styles.pendingInfo}>
        <Text style={styles.pendingName}>{pendingUser.name}</Text>
        <Text style={styles.pendingEmail}>{pendingUser.email}</Text>
        <Text style={styles.pendingDate}>
          Signed up: {new Date(pendingUser.created_at).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.approveBtn}
        onPress={() => handleApproveUser(pendingUser.id)}
      >
        <Text style={styles.approveBtnText}>Approve</Text>
      </TouchableOpacity>
    </View>
  );

  if (!canInviteUsers && !isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={64} color="#EF4444" />
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedText}>
            Team Management is only available to Admins and Managers.
          </Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Management</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowInviteModal(true)}
        >
          <Ionicons name="person-add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'members' && styles.activeTab]}
          onPress={() => setActiveTab('members')}
        >
          <Text style={[styles.tabText, activeTab === 'members' && styles.activeTabText]}>
            Members ({users.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'invitations' && styles.activeTab]}
          onPress={() => setActiveTab('invitations')}
        >
          <Text style={[styles.tabText, activeTab === 'invitations' && styles.activeTabText]}>
            Invitations ({invitations.length})
          </Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
              Pending ({pendingUsers.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {activeTab === 'members' && (
          <>
            {users.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#64748B" />
                <Text style={styles.emptyText}>No team members yet</Text>
                <Text style={styles.emptySubtext}>Invite your first team member</Text>
              </View>
            ) : (
              users.map(renderUserCard)
            )}
          </>
        )}

        {activeTab === 'invitations' && (
          <>
            {invitations.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="mail-outline" size={48} color="#64748B" />
                <Text style={styles.emptyText}>No pending invitations</Text>
                <Text style={styles.emptySubtext}>Send an invitation to add team members</Text>
              </View>
            ) : (
              invitations.map(renderInvitationCard)
            )}
          </>
        )}

        {activeTab === 'pending' && isAdmin && (
          <>
            {pendingUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="hourglass-outline" size={48} color="#64748B" />
                <Text style={styles.emptyText}>No users pending approval</Text>
              </View>
            ) : (
              pendingUsers.map(renderPendingUserCard)
            )}
          </>
        )}
      </ScrollView>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Team Member</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter email address"
                placeholderTextColor="#64748B"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter name"
                placeholderTextColor="#64748B"
                value={inviteName}
                onChangeText={setInviteName}
                autoCapitalize="words"
              />

              <Text style={styles.inputLabel}>Role</Text>
              <View style={styles.roleSelector}>
                {isAdmin && (
                  <TouchableOpacity
                    style={[
                      styles.roleOption,
                      inviteRole === 'manager' && styles.roleOptionSelected,
                    ]}
                    onPress={() => setInviteRole('manager')}
                  >
                    <Ionicons
                      name="people"
                      size={20}
                      color={inviteRole === 'manager' ? '#FFFFFF' : '#3B82F6'}
                    />
                    <Text
                      style={[
                        styles.roleOptionText,
                        inviteRole === 'manager' && styles.roleOptionTextSelected,
                      ]}
                    >
                      Manager
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.roleOption,
                    inviteRole === 'agent' && styles.roleOptionSelected,
                  ]}
                  onPress={() => setInviteRole('agent')}
                >
                  <Ionicons
                    name="person"
                    size={20}
                    color={inviteRole === 'agent' ? '#FFFFFF' : '#22C55E'}
                  />
                  <Text
                    style={[
                      styles.roleOptionText,
                      inviteRole === 'agent' && styles.roleOptionTextSelected,
                    ]}
                  >
                    Agent
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.sendButton, isInviting && styles.sendButtonDisabled]}
              onPress={handleInvite}
              disabled={isInviting}
            >
              {isInviting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.sendButtonText}>Send Invitation</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Action Modal for Admin */}
      <Modal
        visible={showActionModal && selectedUser !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setShowActionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.actionModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedUser?.name}</Text>
              <TouchableOpacity onPress={() => setShowActionModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.actionList}>
              {selectedUser?.role === 'agent' && (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => handleChangeRole(selectedUser.id, 'manager')}
                >
                  <Ionicons name="arrow-up-circle" size={24} color="#3B82F6" />
                  <Text style={styles.actionItemText}>Promote to Manager</Text>
                </TouchableOpacity>
              )}

              {selectedUser?.role === 'manager' && (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => handleChangeRole(selectedUser.id, 'agent')}
                >
                  <Ionicons name="arrow-down-circle" size={24} color="#F59E0B" />
                  <Text style={styles.actionItemText}>Demote to Agent</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => handleToggleStatus(selectedUser?.id || '', selectedUser?.is_active || false)}
              >
                <Ionicons
                  name={selectedUser?.is_active ? 'pause-circle' : 'play-circle'}
                  size={24}
                  color={selectedUser?.is_active ? '#EF4444' : '#22C55E'}
                />
                <Text style={styles.actionItemText}>
                  {selectedUser?.is_active ? 'Deactivate User' : 'Activate User'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  addButton: {
    padding: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#1E293B',
  },
  tabText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  inactiveBadge: {
    backgroundColor: '#EF444420',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '600',
  },
  memberEmail: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 2,
  },
  memberMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  managerText: {
    color: '#94A3B8',
    fontSize: 11,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  inviteInfo: {
    flex: 1,
  },
  inviteEmail: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  inviteName: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  inviteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  inviteDate: {
    color: '#64748B',
    fontSize: 11,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteActionBtn: {
    padding: 8,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  pendingInfo: {
    flex: 1,
  },
  pendingName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pendingEmail: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  pendingDate: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },
  approveBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 4,
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  accessDeniedTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  accessDeniedText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  goBackButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  goBackButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
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
  actionModalContent: {
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
    marginBottom: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#334155',
    borderRadius: 10,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#334155',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleOptionSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  roleOptionText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  roleOptionTextSelected: {
    color: '#FFFFFF',
  },
  sendButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionList: {
    gap: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    backgroundColor: '#334155',
    borderRadius: 12,
    marginBottom: 8,
  },
  actionItemText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
});

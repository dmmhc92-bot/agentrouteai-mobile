import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import ProfileAvatar from '../../src/components/ProfileAvatar';

// ==================== TYPE DEFINITIONS ====================

interface TeamMemberActivity {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_image?: string;
  leads_added_today: number;
  appointments_created_today: number;
  follow_ups_completed_today: number;
  last_activity: string | null;
  has_activity_today: boolean;
}

interface InactiveAgent {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_image?: string;
  last_activity: string | null;
}

interface StaleLead {
  lead_id: string;
  name: string;
  phone: string;
  stage: string;
  days_since_activity: number;
  last_activity_date: string | null;
  owner_name: string;
  owner_id: string;
}

interface TopPerformer {
  user_id: string;
  name: string;
  email: string;
  role: string;
  profile_image?: string;
  score: number;
  breakdown: {
    leads_added: number;
    appointments_created: number;
    follow_ups_completed: number;
  };
  scoring_rule: string;
}

interface CommandCenterData {
  team_activity_today: TeamMemberActivity[];
  needs_attention: {
    inactive_agents: InactiveAgent[];
    stale_leads: StaleLead[];
    summary: {
      inactive_count: number;
      stale_leads_count: number;
    };
  };
  top_performer: TopPerformer | null;
  summary: {
    total_team_members: number;
    active_today: number;
    total_leads_today: number;
    total_appointments_today: number;
  };
  generated_at: string;
  error?: string;
}

// ==================== HELPER FUNCTIONS ====================

function formatLastActivity(isoDate: string | null): string {
  if (!isoDate) return 'No activity recorded';
  
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function getRoleBadgeColor(role: string): string {
  switch (role) {
    case 'admin': return '#3B82F6';
    case 'manager': return '#8B5CF6';
    default: return '#22C55E';
  }
}

function getStageLabel(stage: string): string {
  const stageLabels: Record<string, string> = {
    'new_lead': 'New Lead',
    'contacted': 'Contacted',
    'appointment_scheduled': 'Apt. Scheduled',
    'quoted': 'Quoted',
    'application_submitted': 'App Submitted',
    'underwriting': 'Underwriting',
    'policy_issued': 'Policy Issued',
    'policy_delivered': 'Delivered',
    'follow_up': 'Follow Up',
    'lost': 'Lost',
    'not_qualified': 'Not Qualified'
  };
  return stageLabels[stage] || stage;
}

// ==================== MAIN COMPONENT ====================

export default function ManagerCommandCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Check role access
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const hasAccess = isAdmin || isManager;

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const result = await api.getManagerDailyCommandCenter();
      setData(result);
      if (result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      console.error('Error loading command center:', err);
      if (err?.response?.status === 403) {
        setError('Access denied. This feature is only available to Admins and Managers.');
      } else {
        setError('Failed to load command center data. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (hasAccess) {
        loadData();
      } else {
        setLoading(false);
        setError('Access denied. This feature is only available to Admins and Managers.');
      }
    }, [hasAccess, loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const navigateToUserProfile = (userId: string) => {
    // Navigate to team management with focus on user
    router.push(`/team-management?userId=${userId}`);
  };

  const navigateToLead = (leadId: string) => {
    router.push(`/lead/${leadId}`);
  };

  // ==================== ACCESS DENIED STATE ====================
  if (!hasAccess) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Daily Command Center</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyStateContainer}>
          <Ionicons name="lock-closed" size={64} color="#64748B" />
          <Text style={styles.emptyStateTitle}>Access Restricted</Text>
          <Text style={styles.emptyStateText}>
            This feature is only available to Admins and Managers.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ==================== LOADING STATE ====================
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Daily Command Center</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading command center...</Text>
        </View>
      </View>
    );
  }

  // ==================== ERROR STATE ====================
  if (error && !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Daily Command Center</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyStateContainer}>
          <Ionicons name="alert-circle" size={64} color="#EF4444" />
          <Text style={styles.emptyStateTitle}>Unable to Load</Text>
          <Text style={styles.emptyStateText}>{error}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={loadData}>
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ==================== MAIN CONTENT ====================
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Command Center</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Stats */}
        {data && (
          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{data.summary.total_team_members}</Text>
              <Text style={styles.summaryLabel}>Team</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: '#22C55E' }]}>
                {data.summary.active_today}
              </Text>
              <Text style={styles.summaryLabel}>Active</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{data.summary.total_leads_today}</Text>
              <Text style={styles.summaryLabel}>Leads</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{data.summary.total_appointments_today}</Text>
              <Text style={styles.summaryLabel}>Apts</Text>
            </View>
          </View>
        )}

        {/* Section A: Top Performer Snapshot */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="trophy" size={20} color="#F59E0B" />
              <Text style={styles.sectionTitle}>Top Performer Today</Text>
            </View>
          </View>
          
          {data?.top_performer ? (
            <TouchableOpacity 
              style={styles.topPerformerCard}
              onPress={() => navigateToUserProfile(data.top_performer!.user_id)}
              activeOpacity={0.7}
            >
              <View style={styles.topPerformerHeader}>
                <ProfileAvatar 
                  name={data.top_performer.name}
                  profileImage={data.top_performer.profile_image}
                  size={56}
                />
                <View style={styles.topPerformerInfo}>
                  <Text style={styles.topPerformerName}>{data.top_performer.name}</Text>
                  <View style={styles.topPerformerBadge}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.topPerformerScore}>
                      {data.top_performer.score} pts
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748B" />
              </View>
              <View style={styles.topPerformerStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{data.top_performer.breakdown.leads_added}</Text>
                  <Text style={styles.statLabel}>Leads</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{data.top_performer.breakdown.appointments_created}</Text>
                  <Text style={styles.statLabel}>Appts</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{data.top_performer.breakdown.follow_ups_completed}</Text>
                  <Text style={styles.statLabel}>Follow-ups</Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="hourglass-outline" size={32} color="#64748B" />
              <Text style={styles.emptyCardTitle}>No Activity Yet</Text>
              <Text style={styles.emptyCardText}>
                Team activity will appear here as members work throughout the day.
              </Text>
            </View>
          )}
        </View>

        {/* Section B: Needs Attention */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <Text style={styles.sectionTitle}>Needs Attention</Text>
            </View>
            {data?.needs_attention && (
              <View style={styles.attentionBadge}>
                <Text style={styles.attentionBadgeText}>
                  {data.needs_attention.summary.inactive_count + data.needs_attention.summary.stale_leads_count}
                </Text>
              </View>
            )}
          </View>

          {/* Inactive Agents */}
          {data?.needs_attention.inactive_agents && data.needs_attention.inactive_agents.length > 0 && (
            <View style={styles.attentionSubsection}>
              <Text style={styles.subsectionTitle}>
                <Ionicons name="person-outline" size={14} color="#94A3B8" /> Inactive Team Members Today
              </Text>
              {data.needs_attention.inactive_agents.slice(0, 5).map((agent) => (
                <TouchableOpacity
                  key={agent.user_id}
                  style={styles.attentionRow}
                  onPress={() => navigateToUserProfile(agent.user_id)}
                  activeOpacity={0.7}
                >
                  <ProfileAvatar 
                    name={agent.name}
                    profileImage={agent.profile_image}
                    size={36}
                  />
                  <View style={styles.attentionRowInfo}>
                    <Text style={styles.attentionRowName}>{agent.name}</Text>
                    <Text style={styles.attentionRowMeta}>
                      Last active: {formatLastActivity(agent.last_activity)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </TouchableOpacity>
              ))}
              {data.needs_attention.inactive_agents.length > 5 && (
                <Text style={styles.moreText}>
                  +{data.needs_attention.inactive_agents.length - 5} more
                </Text>
              )}
            </View>
          )}

          {/* Stale Leads */}
          {data?.needs_attention.stale_leads && data.needs_attention.stale_leads.length > 0 && (
            <View style={styles.attentionSubsection}>
              <Text style={styles.subsectionTitle}>
                <Ionicons name="time-outline" size={14} color="#94A3B8" /> Stale Leads (7+ days)
              </Text>
              {data.needs_attention.stale_leads.slice(0, 5).map((lead) => (
                <TouchableOpacity
                  key={lead.lead_id}
                  style={styles.attentionRow}
                  onPress={() => navigateToLead(lead.lead_id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.staleLeadIcon}>
                    <Ionicons name="person-circle-outline" size={28} color="#F59E0B" />
                  </View>
                  <View style={styles.attentionRowInfo}>
                    <Text style={styles.attentionRowName}>{lead.name}</Text>
                    <Text style={styles.attentionRowMeta}>
                      {getStageLabel(lead.stage)} • {lead.days_since_activity} days • {lead.owner_name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </TouchableOpacity>
              ))}
              {data.needs_attention.stale_leads.length > 5 && (
                <Text style={styles.moreText}>
                  +{data.needs_attention.stale_leads.length - 5} more
                </Text>
              )}
            </View>
          )}

          {/* Empty state for needs attention */}
          {data?.needs_attention.summary.inactive_count === 0 && 
           data?.needs_attention.summary.stale_leads_count === 0 && (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle" size={32} color="#22C55E" />
              <Text style={styles.emptyCardTitle}>All Clear!</Text>
              <Text style={styles.emptyCardText}>
                No urgent items need your attention right now.
              </Text>
            </View>
          )}
        </View>

        {/* Section C: Team Activity Today */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="people" size={20} color="#3B82F6" />
              <Text style={styles.sectionTitle}>Team Activity Today</Text>
            </View>
          </View>

          {data?.team_activity_today && data.team_activity_today.length > 0 ? (
            data.team_activity_today.map((member) => (
              <TouchableOpacity
                key={member.user_id}
                style={styles.teamMemberCard}
                onPress={() => navigateToUserProfile(member.user_id)}
                activeOpacity={0.7}
              >
                <View style={styles.teamMemberHeader}>
                  <ProfileAvatar 
                    name={member.name}
                    profileImage={member.profile_image}
                    size={44}
                  />
                  <View style={styles.teamMemberInfo}>
                    <View style={styles.teamMemberNameRow}>
                      <Text style={styles.teamMemberName}>{member.name}</Text>
                      {!member.has_activity_today && member.role !== 'admin' && (
                        <View style={styles.inactiveBadge}>
                          <Text style={styles.inactiveBadgeText}>Inactive</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.teamMemberRoleRow}>
                      <View style={[styles.roleBadgeSmall, { backgroundColor: getRoleBadgeColor(member.role) }]}>
                        <Text style={styles.roleBadgeTextSmall}>
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </Text>
                      </View>
                      <Text style={styles.lastActivityText}>
                        {formatLastActivity(member.last_activity)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </View>
                <View style={styles.teamMemberStats}>
                  <View style={styles.miniStat}>
                    <Ionicons name="person-add-outline" size={14} color="#22C55E" />
                    <Text style={styles.miniStatValue}>{member.leads_added_today}</Text>
                    <Text style={styles.miniStatLabel}>Leads</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <Ionicons name="calendar-outline" size={14} color="#3B82F6" />
                    <Text style={styles.miniStatValue}>{member.appointments_created_today}</Text>
                    <Text style={styles.miniStatLabel}>Appts</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <Ionicons name="checkmark-done-outline" size={14} color="#8B5CF6" />
                    <Text style={styles.miniStatValue}>{member.follow_ups_completed_today}</Text>
                    <Text style={styles.miniStatLabel}>Follow-ups</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={32} color="#64748B" />
              <Text style={styles.emptyCardTitle}>No Team Members</Text>
              <Text style={styles.emptyCardText}>
                Your team will appear here once members are added.
              </Text>
            </View>
          )}
        </View>

        {/* Footer spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ==================== STYLES ====================

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
    borderRadius: 20,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#94A3B8',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Summary Bar
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#334155',
    marginHorizontal: 8,
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Top Performer
  topPerformerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F59E0B30',
  },
  topPerformerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topPerformerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  topPerformerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topPerformerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  topPerformerScore: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  topPerformerStats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Empty Card
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 12,
  },
  emptyCardText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },

  // Needs Attention
  attentionBadge: {
    backgroundColor: '#EF444420',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  attentionBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  attentionSubsection: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
    marginBottom: 12,
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  attentionRowInfo: {
    flex: 1,
    marginLeft: 12,
  },
  attentionRowName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  attentionRowMeta: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  staleLeadIcon: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    fontSize: 13,
    color: '#3B82F6',
    marginTop: 8,
    textAlign: 'center',
  },

  // Team Member Card
  teamMemberCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  teamMemberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamMemberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  teamMemberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamMemberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  inactiveBadge: {
    backgroundColor: '#EF444420',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#EF4444',
  },
  teamMemberRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  roleBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleBadgeTextSmall: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  lastActivityText: {
    fontSize: 12,
    color: '#64748B',
  },
  teamMemberStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  miniStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  miniStatLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
});

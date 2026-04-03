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
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';

// Stage configuration with professional display labels
const STAGE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  new_lead: { label: 'New', color: '#6B7280', icon: 'person-add' },
  new: { label: 'New', color: '#6B7280', icon: 'person-add' },
  contacted: { label: 'Contacted', color: '#3B82F6', icon: 'chatbubble' },
  follow_up: { label: 'Follow Up', color: '#F59E0B', icon: 'time' },
  appointment_set: { label: 'Appt Set', color: '#3B82F6', icon: 'calendar' },
  appointment_scheduled: { label: 'Appt Set', color: '#3B82F6', icon: 'calendar' },
  qualified: { label: 'Qualified', color: '#06B6D4', icon: 'checkmark-done' },
  policy_submitted: { label: 'Submitted', color: '#8B5CF6', icon: 'document-text' },
  application_submitted: { label: 'Submitted', color: '#8B5CF6', icon: 'document-text' },
  underwriting_review: { label: 'Underwriting', color: '#F59E0B', icon: 'hourglass' },
  additional_requirements: { label: 'Add. Req.', color: '#EF4444', icon: 'alert-circle' },
  approved: { label: 'Approved', color: '#10B981', icon: 'checkmark-circle' },
  closed_won: { label: 'Closed Won', color: '#22C55E', icon: 'trophy' },
  policy_issued: { label: 'Issued', color: '#06B6D4', icon: 'document' },
  policy_placed: { label: 'Placed', color: '#14B8A6', icon: 'checkmark-done' },
  commission_pending: { label: 'Comm Pending', color: '#F97316', icon: 'cash' },
  commission_paid: { label: 'Comm Paid', color: '#22C55E', icon: 'wallet' },
  closed_lost: { label: 'Lost', color: '#EF4444', icon: 'close-circle' },
};

const GRADE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  'A': { color: '#22C55E', bg: '#22C55E20', label: 'Top Performer' },
  'B': { color: '#3B82F6', bg: '#3B82F620', label: 'Strong' },
  'C': { color: '#F59E0B', bg: '#F59E0B20', label: 'Average' },
  'D': { color: '#EF4444', bg: '#EF444420', label: 'Needs Coaching' },
  'F': { color: '#DC2626', bg: '#DC262620', label: 'At Risk' },
};

interface AgentDetails {
  agent: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    territory: string | null;
    commission_rate: number;
    last_login: string | null;
    created_at: string;
    scorecard_grade?: string;
  };
  leads: any[];
  appointments: any[];
  activities: any[];
  tasks: any[];
  summary: {
    total_leads: number;
    leads_by_stage: Record<string, number>;
    total_appointments: number;
    appointments_completed: number;
    total_production: number;
    total_commission: number;
    overdue_tasks: number;
    pending_follow_ups: number;
  };
}

export default function AgentDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agentData, setAgentData] = useState<AgentDetails | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'pipeline' | 'activity'>('overview');

  const loadData = async () => {
    if (!id) return;
    
    try {
      const data = await api.getAgentDetails(id);
      setAgentData(data);
    } catch (error: any) {
      console.error('Error loading agent details:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view this agent');
        router.back();
      } else {
        Alert.alert('Error', 'Failed to load agent details');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toFixed(0)}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return 'N/A';
    }
  };

  const getActivityIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      'lead_created': 'person-add',
      'lead_updated': 'create',
      'appointment_created': 'calendar',
      'appointment_completed': 'checkmark-circle',
      'pipeline_move': 'arrow-forward',
      'login': 'log-in',
      'call': 'call',
      'email': 'mail',
    };
    return iconMap[type] || 'ellipse';
  };

  const handleCall = () => {
    if (agentData?.agent.phone) {
      Linking.openURL(`tel:${agentData.agent.phone}`);
    }
  };

  const handleEmail = () => {
    if (agentData?.agent.email) {
      Linking.openURL(`mailto:${agentData.agent.email}`);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading Agent Profile...</Text>
        </View>
      </View>
    );
  }

  if (!agentData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
          </View>
          <Text style={styles.errorTitle}>Agent Not Found</Text>
          <Text style={styles.errorText}>This agent may have been removed or you don't have access.</Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { agent, summary, leads, appointments, activities } = agentData;
  const gradeConfig = GRADE_CONFIG[agent.scorecard_grade || 'C'] || GRADE_CONFIG['C'];
  const activityStatus = agent.last_login 
    ? ((Date.now() - new Date(agent.last_login).getTime()) / (1000 * 60 * 60) < 24 ? 'Active' : 'Inactive')
    : 'Never Active';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Agent Profile</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Agent Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileMain}>
          <View style={[styles.profileAvatar, { backgroundColor: gradeConfig.bg }]}>
            <Text style={[styles.profileAvatarText, { color: gradeConfig.color }]}>
              {agent.name.charAt(0).toUpperCase()}
            </Text>
            {agent.scorecard_grade && (
              <View style={[styles.profileGradeBadge, { backgroundColor: gradeConfig.color }]}>
                <Text style={styles.profileGradeText}>{agent.scorecard_grade}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{agent.name}</Text>
            <Text style={styles.profileRole}>{agent.role.charAt(0).toUpperCase() + agent.role.slice(1)}</Text>
            <View style={styles.profileStatusRow}>
              <View style={[styles.statusDot, { 
                backgroundColor: activityStatus === 'Active' ? '#22C55E' : '#64748B' 
              }]} />
              <Text style={[styles.profileStatus, { 
                color: activityStatus === 'Active' ? '#22C55E' : '#64748B' 
              }]}>
                {activityStatus}
              </Text>
              {agent.territory && (
                <>
                  <Text style={styles.profileDivider}>•</Text>
                  <Text style={styles.profileTerritory}>{agent.territory}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Contact Actions */}
        <View style={styles.contactActions}>
          {agent.phone && (
            <TouchableOpacity style={styles.contactButton} onPress={handleCall}>
              <Ionicons name="call" size={18} color="#3B82F6" />
              <Text style={styles.contactButtonText}>Call</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.contactButton} onPress={handleEmail}>
            <Ionicons name="mail" size={18} color="#3B82F6" />
            <Text style={styles.contactButtonText}>Email</Text>
          </TouchableOpacity>
        </View>

        {/* Performance Score */}
        <View style={styles.performanceScore}>
          <View style={[styles.scoreCard, { borderColor: gradeConfig.color }]}>
            <Text style={styles.scoreLabel}>Performance Score</Text>
            <View style={styles.scoreContent}>
              <Text style={[styles.scoreGrade, { color: gradeConfig.color }]}>{agent.scorecard_grade || 'C'}</Text>
              <Text style={[styles.scoreDesc, { color: gradeConfig.color }]}>{gradeConfig.label}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Ionicons name="people" size={20} color="#3B82F6" />
          <Text style={styles.statValue}>{summary.total_leads}</Text>
          <Text style={styles.statLabel}>Leads</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="calendar" size={20} color="#8B5CF6" />
          <Text style={styles.statValue}>{summary.appointments_completed}</Text>
          <Text style={styles.statLabel}>Appts Done</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="trending-up" size={20} color="#22C55E" />
          <Text style={[styles.statValue, { color: '#22C55E' }]}>{formatCurrency(summary.total_production)}</Text>
          <Text style={styles.statLabel}>Production</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="wallet" size={20} color="#F59E0B" />
          <Text style={[styles.statValue, { color: '#F59E0B' }]}>{formatCurrency(summary.total_commission)}</Text>
          <Text style={styles.statLabel}>Commission</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {[
          { key: 'overview', label: 'Overview', icon: 'grid' },
          { key: 'leads', label: 'Leads', icon: 'people' },
          { key: 'pipeline', label: 'Pipeline', icon: 'git-branch' },
          { key: 'activity', label: 'Activity', icon: 'time' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key as any)}
          >
            <Ionicons 
              name={tab.icon as any} 
              size={16} 
              color={activeTab === tab.key ? '#3B82F6' : '#64748B'} 
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && (
          <>
            {/* Alerts Section */}
            {(summary.overdue_tasks > 0 || summary.pending_follow_ups > 0) && (
              <View style={styles.alertsSection}>
                <Text style={styles.sectionTitle}>Needs Attention</Text>
                <View style={styles.alertsGrid}>
                  {summary.overdue_tasks > 0 && (
                    <View style={styles.alertCard}>
                      <View style={[styles.alertIcon, { backgroundColor: '#EF444420' }]}>
                        <Ionicons name="alert-circle" size={20} color="#EF4444" />
                      </View>
                      <Text style={styles.alertValue}>{summary.overdue_tasks}</Text>
                      <Text style={styles.alertLabel}>Overdue Tasks</Text>
                    </View>
                  )}
                  {summary.pending_follow_ups > 0 && (
                    <View style={styles.alertCard}>
                      <View style={[styles.alertIcon, { backgroundColor: '#F59E0B20' }]}>
                        <Ionicons name="time" size={20} color="#F59E0B" />
                      </View>
                      <Text style={styles.alertValue}>{summary.pending_follow_ups}</Text>
                      <Text style={styles.alertLabel}>Pending Follow-ups</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Agent Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Agent Information</Text>
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{agent.email}</Text>
                </View>
                {agent.phone && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Phone</Text>
                    <Text style={styles.infoValue}>{agent.phone}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Commission Rate</Text>
                  <Text style={styles.infoValue}>{(agent.commission_rate * 100).toFixed(0)}%</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Member Since</Text>
                  <Text style={styles.infoValue}>{formatDate(agent.created_at)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Last Login</Text>
                  <Text style={styles.infoValue}>
                    {agent.last_login 
                      ? formatDistanceToNow(new Date(agent.last_login), { addSuffix: true })
                      : 'Never'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Quick Pipeline Summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pipeline Quick View</Text>
              <View style={styles.pipelineQuickView}>
                {Object.entries(summary.leads_by_stage)
                  .filter(([_, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([stage, count]) => {
                    const config = STAGE_CONFIG[stage] || { label: stage, color: '#6B7280' };
                    return (
                      <View key={stage} style={styles.pipelineQuickItem}>
                        <View style={[styles.pipelineQuickDot, { backgroundColor: config.color }]} />
                        <Text style={styles.pipelineQuickLabel}>{config.label}</Text>
                        <Text style={styles.pipelineQuickCount}>{count}</Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          </>
        )}

        {activeTab === 'leads' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Leads ({leads.length})</Text>
            {leads.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#334155" />
                <Text style={styles.emptyText}>No leads assigned</Text>
              </View>
            ) : (
              leads.slice(0, 25).map((lead) => {
                const stageConfig = STAGE_CONFIG[lead.stage] || { label: lead.stage, color: '#6B7280' };
                return (
                  <TouchableOpacity
                    key={lead.id}
                    style={styles.leadCard}
                    onPress={() => router.push(`/lead/${lead.id}`)}
                  >
                    <View style={styles.leadHeader}>
                      <View style={styles.leadInfo}>
                        <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
                        <Text style={styles.leadContact} numberOfLines={1}>
                          {lead.phone || lead.email || 'No contact info'}
                        </Text>
                      </View>
                      <View style={[styles.leadStageBadge, { backgroundColor: stageConfig.color + '20' }]}>
                        <Text style={[styles.leadStageText, { color: stageConfig.color }]}>
                          {stageConfig.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.leadDate}>Added {formatDate(lead.created_date)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
            {leads.length > 25 && (
              <Text style={styles.moreText}>+ {leads.length - 25} more leads</Text>
            )}
          </View>
        )}

        {activeTab === 'pipeline' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pipeline Distribution</Text>
            {Object.entries(summary.leads_by_stage)
              .filter(([_, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([stage, count]) => {
                const config = STAGE_CONFIG[stage] || { label: stage, color: '#6B7280' };
                const percentage = summary.total_leads > 0 ? (count / summary.total_leads) * 100 : 0;
                return (
                  <View key={stage} style={styles.pipelineRow}>
                    <View style={styles.pipelineRowHeader}>
                      <View style={[styles.pipelineDot, { backgroundColor: config.color }]} />
                      <Text style={styles.pipelineLabel}>{config.label}</Text>
                      <Text style={styles.pipelineCount}>{count}</Text>
                      <Text style={styles.pipelinePercent}>{percentage.toFixed(0)}%</Text>
                    </View>
                    <View style={styles.pipelineBar}>
                      <View 
                        style={[
                          styles.pipelineBarFill, 
                          { width: `${percentage}%`, backgroundColor: config.color }
                        ]} 
                      />
                    </View>
                  </View>
                );
              })}
            {Object.values(summary.leads_by_stage).every(c => c === 0) && (
              <View style={styles.emptyState}>
                <Ionicons name="git-branch-outline" size={48} color="#334155" />
                <Text style={styles.emptyText}>No leads in pipeline</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'activity' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {activities.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={48} color="#334155" />
                <Text style={styles.emptyText}>No recent activity</Text>
              </View>
            ) : (
              activities.slice(0, 30).map((activity, index) => (
                <View key={activity.id || index} style={styles.activityRow}>
                  <View style={styles.activityIconContainer}>
                    <Ionicons 
                      name={getActivityIcon(activity.action_type) as any} 
                      size={16} 
                      color="#3B82F6" 
                    />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>
                      {activity.description || activity.action_type.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.activityTime}>
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EF444420',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  errorText: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
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
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  profileCard: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  profileMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  profileAvatarText: {
    fontSize: 28,
    fontWeight: '700',
  },
  profileGradeBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0F172A',
  },
  profileGradeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  profileRole: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 2,
  },
  profileStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  profileStatus: {
    fontSize: 13,
    fontWeight: '500',
  },
  profileDivider: {
    color: '#475569',
    marginHorizontal: 8,
  },
  profileTerritory: {
    color: '#64748B',
    fontSize: 13,
  },
  contactActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  contactButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  performanceScore: {
    marginTop: 16,
  },
  scoreCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreLabel: {
    color: '#94A3B8',
    fontSize: 14,
  },
  scoreContent: {
    alignItems: 'flex-end',
  },
  scoreGrade: {
    fontSize: 28,
    fontWeight: '800',
  },
  scoreDesc: {
    fontSize: 12,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  statLabel: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#3B82F620',
  },
  tabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#3B82F6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  alertsSection: {
    marginBottom: 24,
  },
  alertsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  alertCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  alertLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 14,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  pipelineQuickView: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  pipelineQuickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
  },
  pipelineQuickDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  pipelineQuickLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    flex: 1,
  },
  pipelineQuickCount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 12,
  },
  leadCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  leadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leadInfo: {
    flex: 1,
    marginRight: 12,
  },
  leadName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  leadContact: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 2,
  },
  leadStageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  leadStageText: {
    fontSize: 11,
    fontWeight: '600',
  },
  leadDate: {
    color: '#475569',
    fontSize: 11,
    marginTop: 10,
  },
  moreText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  pipelineRow: {
    marginBottom: 16,
  },
  pipelineRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pipelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  pipelineLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    flex: 1,
  },
  pipelineCount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
  },
  pipelinePercent: {
    color: '#64748B',
    fontSize: 12,
    width: 36,
    textAlign: 'right',
  },
  pipelineBar: {
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  pipelineBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  activityIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    color: '#E2E8F0',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  activityTime: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },
});

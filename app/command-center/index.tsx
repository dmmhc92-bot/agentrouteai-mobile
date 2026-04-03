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
  Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

const { width } = Dimensions.get('window');

interface AgentStats {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  territory?: string;
  leads_count: number;
  appointments_scheduled: number;
  appointments_completed: number;
  applications_submitted: number;
  policies_issued: number;
  total_premium: number;
  total_commission: number;
  last_login: string | null;
  is_active: boolean;
  scorecard_grade: string;
  overdue_tasks?: number;
  pending_follow_ups?: number;
}

interface TeamSnapshot {
  total_agents: number;
  active_today: number;
  needs_coaching: number;
  overdue_leads: number;
  top_producers: { id: string; name: string; total: number }[];
}

const GRADE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  'A': { color: '#22C55E', bg: '#22C55E20', label: 'Top Performer' },
  'B': { color: '#3B82F6', bg: '#3B82F620', label: 'Strong' },
  'C': { color: '#F59E0B', bg: '#F59E0B20', label: 'Average' },
  'D': { color: '#EF4444', bg: '#EF444420', label: 'Needs Coaching' },
  'F': { color: '#DC2626', bg: '#DC262620', label: 'At Risk' },
};

export default function CommandCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [snapshot, setSnapshot] = useState<TeamSnapshot | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'attention'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'production' | 'grade' | 'activity'>('production');

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    if (!isManagerOrAdmin) {
      setIsLoading(false);
      return;
    }
    
    try {
      const [agentsData, snapshotData] = await Promise.all([
        api.getTeamAgents().catch(() => []),
        api.getTeamSnapshot().catch(() => null),
      ]);
      setAgents(Array.isArray(agentsData) ? agentsData : []);
      setSnapshot(snapshotData);
    } catch (error: any) {
      console.error('Error loading command center:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view the Command Center');
        router.back();
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const getActivityStatus = (lastLogin: string | null) => {
    if (!lastLogin) return { status: 'Never Active', color: '#64748B', dot: '#475569' };
    const hours = (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60);
    if (hours < 1) return { status: 'Online Now', color: '#22C55E', dot: '#22C55E' };
    if (hours < 8) return { status: 'Active Today', color: '#3B82F6', dot: '#3B82F6' };
    if (hours < 24) return { status: 'Today', color: '#22C55E', dot: '#22C55E' };
    if (hours < 72) return { status: '2-3 Days Ago', color: '#F59E0B', dot: '#F59E0B' };
    return { status: 'Inactive', color: '#EF4444', dot: '#EF4444' };
  };

  const filteredAgents = agents.filter(agent => {
    if (filterStatus === 'all') return true;
    const activity = getActivityStatus(agent.last_login);
    if (filterStatus === 'active') return activity.status === 'Online Now' || activity.status === 'Active Today' || activity.status === 'Today';
    if (filterStatus === 'inactive') return activity.status === 'Inactive' || activity.status === 'Never Active';
    if (filterStatus === 'attention') return agent.scorecard_grade === 'D' || agent.scorecard_grade === 'F' || (agent.overdue_tasks || 0) > 0;
    return true;
  });

  const sortedAgents = [...filteredAgents].sort((a, b) => {
    switch (sortBy) {
      case 'production': return b.total_premium - a.total_premium;
      case 'grade': {
        const gradeOrder: Record<string, number> = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'F': 4 };
        return (gradeOrder[a.scorecard_grade] ?? 5) - (gradeOrder[b.scorecard_grade] ?? 5);
      }
      case 'activity': {
        const aTime = a.last_login ? new Date(a.last_login).getTime() : 0;
        const bTime = b.last_login ? new Date(b.last_login).getTime() : 0;
        return bTime - aTime;
      }
      default: return a.name.localeCompare(b.name);
    }
  });

  if (!isManagerOrAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.accessDenied}>
          <View style={styles.accessDeniedIcon}>
            <Ionicons name="shield" size={48} color="#EF4444" />
          </View>
          <Text style={styles.accessDeniedTitle}>Command Center</Text>
          <Text style={styles.accessDeniedText}>
            This area is restricted to Managers and Admins only.
          </Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackButtonText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading Team Data...</Text>
        </View>
      </View>
    );
  }

  const activeCount = agents.filter(a => {
    const activity = getActivityStatus(a.last_login);
    return activity.status !== 'Inactive' && activity.status !== 'Never Active';
  }).length;

  const attentionCount = agents.filter(a => 
    a.scorecard_grade === 'D' || a.scorecard_grade === 'F' || (a.overdue_tasks || 0) > 0
  ).length;

  const totalProduction = agents.reduce((sum, a) => sum + a.total_premium, 0);
  const totalCommission = agents.reduce((sum, a) => sum + a.total_commission, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Command Center</Text>
          <View style={styles.roleBadge}>
            <Ionicons 
              name={user?.role === 'admin' ? 'shield-checkmark' : 'people-circle'} 
              size={14} 
              color="#3B82F6" 
            />
            <Text style={styles.roleBadgeText}>
              {user?.role === 'admin' ? 'ADMINISTRATOR' : 'MANAGER'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerAction} onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* Quick Stats Bar */}
      <View style={styles.quickStatsBar}>
        <View style={styles.quickStat}>
          <Text style={styles.quickStatValue}>{agents.length}</Text>
          <Text style={styles.quickStatLabel}>Agents</Text>
        </View>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStat}>
          <Text style={[styles.quickStatValue, { color: '#22C55E' }]}>{activeCount}</Text>
          <Text style={styles.quickStatLabel}>Active</Text>
        </View>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStat}>
          <Text style={[styles.quickStatValue, { color: '#F59E0B' }]}>{attentionCount}</Text>
          <Text style={styles.quickStatLabel}>Attention</Text>
        </View>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStat}>
          <Text style={[styles.quickStatValue, { color: '#22C55E' }]}>{formatCurrency(totalProduction)}</Text>
          <Text style={styles.quickStatLabel}>Production</Text>
        </View>
      </View>

      {/* Filter & Sort Bar */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'all' && styles.filterChipActive]}
            onPress={() => setFilterStatus('all')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'all' && styles.filterChipTextActive]}>
              All ({agents.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'active' && styles.filterChipActive]}
            onPress={() => setFilterStatus('active')}
          >
            <View style={[styles.filterDot, { backgroundColor: '#22C55E' }]} />
            <Text style={[styles.filterChipText, filterStatus === 'active' && styles.filterChipTextActive]}>
              Active
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'attention' && styles.filterChipActive]}
            onPress={() => setFilterStatus('attention')}
          >
            <View style={[styles.filterDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={[styles.filterChipText, filterStatus === 'attention' && styles.filterChipTextActive]}>
              Needs Attention
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, filterStatus === 'inactive' && styles.filterChipActive]}
            onPress={() => setFilterStatus('inactive')}
          >
            <View style={[styles.filterDot, { backgroundColor: '#EF4444' }]} />
            <Text style={[styles.filterChipText, filterStatus === 'inactive' && styles.filterChipTextActive]}>
              Inactive
            </Text>
          </TouchableOpacity>
        </ScrollView>
        
        <TouchableOpacity 
          style={styles.sortButton}
          onPress={() => {
            const sorts: ('name' | 'production' | 'grade' | 'activity')[] = ['production', 'grade', 'activity', 'name'];
            const currentIndex = sorts.indexOf(sortBy);
            setSortBy(sorts[(currentIndex + 1) % sorts.length]);
          }}
        >
          <Ionicons name="swap-vertical" size={16} color="#94A3B8" />
          <Text style={styles.sortButtonText}>{sortBy}</Text>
        </TouchableOpacity>
      </View>

      {/* Agent List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
        showsVerticalScrollIndicator={false}
      >
        {sortedAgents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#334155" />
            <Text style={styles.emptyTitle}>No Agents Found</Text>
            <Text style={styles.emptyText}>
              {filterStatus !== 'all' ? 'Try changing your filter' : 'Invite team members to get started'}
            </Text>
          </View>
        ) : (
          sortedAgents.map((agent, index) => {
            const activity = getActivityStatus(agent.last_login);
            const gradeConfig = GRADE_CONFIG[agent.scorecard_grade] || GRADE_CONFIG['C'];
            const hasIssues = agent.scorecard_grade === 'D' || agent.scorecard_grade === 'F' || (agent.overdue_tasks || 0) > 0;
            
            return (
              <TouchableOpacity
                key={agent.id}
                style={[styles.agentCard, hasIssues && styles.agentCardAttention]}
                onPress={() => router.push(`/command-center/${agent.id}`)}
                activeOpacity={0.7}
              >
                {/* Agent Header */}
                <View style={styles.agentHeader}>
                  <View style={styles.agentIdentity}>
                    <View style={styles.agentAvatarContainer}>
                      <View style={[styles.agentAvatar, { backgroundColor: gradeConfig.bg }]}>
                        <Text style={[styles.agentAvatarText, { color: gradeConfig.color }]}>
                          {agent.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={[styles.activityDot, { backgroundColor: activity.dot }]} />
                    </View>
                    <View style={styles.agentInfo}>
                      <View style={styles.agentNameRow}>
                        <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
                        {agent.scorecard_grade && (
                          <View style={[styles.gradeBadge, { backgroundColor: gradeConfig.bg }]}>
                            <Text style={[styles.gradeText, { color: gradeConfig.color }]}>
                              {agent.scorecard_grade}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.agentEmail} numberOfLines={1}>{agent.email}</Text>
                      <View style={styles.agentStatusRow}>
                        <Text style={[styles.activityText, { color: activity.color }]}>
                          {activity.status}
                        </Text>
                        {agent.territory && (
                          <>
                            <Text style={styles.statusDot}>•</Text>
                            <Text style={styles.territoryText}>{agent.territory}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#475569" />
                </View>

                {/* Metrics Grid */}
                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <View style={styles.metricIconContainer}>
                      <Ionicons name="people" size={16} color="#3B82F6" />
                    </View>
                    <View style={styles.metricContent}>
                      <Text style={styles.metricValue}>{agent.leads_count}</Text>
                      <Text style={styles.metricLabel}>Leads</Text>
                    </View>
                  </View>
                  
                  <View style={styles.metricItem}>
                    <View style={styles.metricIconContainer}>
                      <Ionicons name="calendar" size={16} color="#8B5CF6" />
                    </View>
                    <View style={styles.metricContent}>
                      <Text style={styles.metricValue}>
                        {agent.appointments_completed}/{agent.appointments_scheduled}
                      </Text>
                      <Text style={styles.metricLabel}>Appts</Text>
                    </View>
                  </View>
                  
                  <View style={styles.metricItem}>
                    <View style={styles.metricIconContainer}>
                      <Ionicons name="document-text" size={16} color="#F59E0B" />
                    </View>
                    <View style={styles.metricContent}>
                      <Text style={styles.metricValue}>{agent.policies_issued}</Text>
                      <Text style={styles.metricLabel}>Policies</Text>
                    </View>
                  </View>
                  
                  <View style={styles.metricItem}>
                    <View style={styles.metricIconContainer}>
                      <Ionicons name="trending-up" size={16} color="#22C55E" />
                    </View>
                    <View style={styles.metricContent}>
                      <Text style={[styles.metricValue, { color: '#22C55E' }]}>
                        {formatCurrency(agent.total_premium)}
                      </Text>
                      <Text style={styles.metricLabel}>Production</Text>
                    </View>
                  </View>
                </View>

                {/* Alerts Row */}
                {hasIssues && (
                  <View style={styles.alertsRow}>
                    {(agent.overdue_tasks || 0) > 0 && (
                      <View style={styles.alertBadge}>
                        <Ionicons name="alert-circle" size={12} color="#EF4444" />
                        <Text style={styles.alertBadgeText}>{agent.overdue_tasks} Overdue</Text>
                      </View>
                    )}
                    {(agent.pending_follow_ups || 0) > 0 && (
                      <View style={[styles.alertBadge, { backgroundColor: '#F59E0B20' }]}>
                        <Ionicons name="time" size={12} color="#F59E0B" />
                        <Text style={[styles.alertBadgeText, { color: '#F59E0B' }]}>
                          {agent.pending_follow_ups} Follow-ups
                        </Text>
                      </View>
                    )}
                    {(agent.scorecard_grade === 'D' || agent.scorecard_grade === 'F') && (
                      <View style={[styles.alertBadge, { backgroundColor: '#EF444420' }]}>
                        <Ionicons name="school" size={12} color="#EF4444" />
                        <Text style={[styles.alertBadgeText, { color: '#EF4444' }]}>
                          {gradeConfig.label}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                  <TouchableOpacity 
                    style={styles.quickActionButton}
                    onPress={() => router.push(`/command-center/${agent.id}`)}
                  >
                    <Ionicons name="stats-chart" size={14} color="#3B82F6" />
                    <Text style={styles.quickActionText}>Performance</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.quickActionButton}
                    onPress={() => router.push(`/command-center/${agent.id}`)}
                  >
                    <Ionicons name="git-branch" size={14} color="#8B5CF6" />
                    <Text style={styles.quickActionText}>Pipeline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.quickActionButton}
                    onPress={() => router.push(`/command-center/${agent.id}`)}
                  >
                    <Ionicons name="time" size={14} color="#F59E0B" />
                    <Text style={styles.quickActionText}>Activity</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        
        {/* Team Summary Footer */}
        {sortedAgents.length > 0 && (
          <View style={styles.teamSummary}>
            <Text style={styles.teamSummaryTitle}>Team Summary</Text>
            <View style={styles.teamSummaryGrid}>
              <View style={styles.teamSummaryItem}>
                <Ionicons name="people" size={20} color="#3B82F6" />
                <Text style={styles.teamSummaryValue}>
                  {agents.reduce((sum, a) => sum + a.leads_count, 0)}
                </Text>
                <Text style={styles.teamSummaryLabel}>Total Leads</Text>
              </View>
              <View style={styles.teamSummaryItem}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.teamSummaryValue}>
                  {agents.reduce((sum, a) => sum + a.appointments_completed, 0)}
                </Text>
                <Text style={styles.teamSummaryLabel}>Appts Done</Text>
              </View>
              <View style={styles.teamSummaryItem}>
                <Ionicons name="document" size={20} color="#8B5CF6" />
                <Text style={styles.teamSummaryValue}>
                  {agents.reduce((sum, a) => sum + a.policies_issued, 0)}
                </Text>
                <Text style={styles.teamSummaryLabel}>Policies</Text>
              </View>
              <View style={styles.teamSummaryItem}>
                <Ionicons name="wallet" size={20} color="#22C55E" />
                <Text style={[styles.teamSummaryValue, { color: '#22C55E' }]}>
                  {formatCurrency(totalCommission)}
                </Text>
                <Text style={styles.teamSummaryLabel}>Commission</Text>
              </View>
            </View>
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
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessDeniedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EF444420',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  accessDeniedTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  accessDeniedText: {
    color: '#94A3B8',
    fontSize: 15,
    textAlign: 'center',
  },
  goBackButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 14,
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
    paddingVertical: 14,
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
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F615',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
    gap: 4,
  },
  roleBadgeText: {
    color: '#3B82F6',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerAction: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickStatsBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  quickStat: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  quickStatLabel: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: '#1E293B',
    marginHorizontal: 8,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    marginLeft: 'auto',
  },
  sortButtonText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  agentCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  agentCardAttention: {
    borderColor: '#F59E0B40',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 12,
  },
  agentIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  agentAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  agentAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentAvatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  activityDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#111827',
  },
  agentInfo: {
    flex: 1,
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  gradeBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  agentEmail: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 2,
  },
  agentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  activityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusDot: {
    color: '#475569',
    marginHorizontal: 6,
    fontSize: 8,
  },
  territoryText: {
    color: '#64748B',
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0F172A80',
    gap: 4,
  },
  metricItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  metricIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricContent: {
    flex: 1,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  alertsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#0F172A50',
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF444420',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  alertBadgeText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  quickActionText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  teamSummary: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  teamSummaryTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  teamSummaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  teamSummaryItem: {
    alignItems: 'center',
  },
  teamSummaryValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  teamSummaryLabel: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },
});

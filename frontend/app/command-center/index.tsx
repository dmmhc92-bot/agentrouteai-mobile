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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';

interface AgentStats {
  id: string;
  name: string;
  email: string;
  role: string;
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
}

interface TeamSnapshot {
  total_agents: number;
  active_today: number;
  needs_coaching: number;
  overdue_leads: number;
  top_producers: { id: string; name: string; total: number }[];
}

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  premium: number;
  commission: number;
  policies: number;
  appointments_completed: number;
}

const GRADE_COLORS: Record<string, string> = {
  'A': '#22C55E',
  'B': '#3B82F6',
  'C': '#F59E0B',
  'D': '#EF4444',
  'F': '#DC2626',
};

export default function CommandCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [snapshot, setSnapshot] = useState<TeamSnapshot | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'leaderboard'>('overview');

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    if (!isManagerOrAdmin) {
      setIsLoading(false);
      return;
    }
    
    try {
      const [agentsData, snapshotData, leaderboardData] = await Promise.all([
        api.getTeamAgents(),
        api.getTeamSnapshot(),
        api.getTeamLeaderboard(leaderboardPeriod),
      ]);
      setAgents(agentsData);
      setSnapshot(snapshotData);
      setLeaderboard(leaderboardData);
    } catch (error: any) {
      console.error('Error loading command center:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view the Command Center');
        router.back();
      } else {
        Alert.alert('Error', 'Failed to load team data');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [leaderboardPeriod])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getLastLoginText = (lastLogin: string | null) => {
    if (!lastLogin) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastLogin), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const getActivityStatus = (lastLogin: string | null) => {
    if (!lastLogin) return { status: 'inactive', color: '#64748B', icon: 'ellipse' };
    const diff = Date.now() - new Date(lastLogin).getTime();
    const hours = diff / (1000 * 60 * 60);
    if (hours < 1) return { status: 'online', color: '#22C55E', icon: 'ellipse' };
    if (hours < 24) return { status: 'today', color: '#3B82F6', icon: 'ellipse' };
    if (hours < 72) return { status: 'recent', color: '#F59E0B', icon: 'ellipse' };
    return { status: 'inactive', color: '#EF4444', icon: 'ellipse' };
  };

  if (!isManagerOrAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={64} color="#EF4444" />
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedText}>
            The Command Center is only available to Managers and Admins.
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading Command Center...</Text>
        </View>
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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Command Center</Text>
          <View style={styles.roleBadge}>
            <Ionicons name={user?.role === 'admin' ? 'shield' : 'people'} size={12} color="#FFFFFF" />
            <Text style={styles.roleBadgeText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {['overview', 'agents', 'leaderboard'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab as any)}
          >
            <Ionicons
              name={
                tab === 'overview' ? 'grid' :
                tab === 'agents' ? 'people' : 'trophy'
              }
              size={18}
              color={activeTab === tab ? '#3B82F6' : '#64748B'}
            />
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
      >
        {activeTab === 'overview' && snapshot && (
          <>
            {/* Quick Stats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Team Snapshot</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Ionicons name="people" size={24} color="#3B82F6" />
                  <Text style={styles.statValue}>{snapshot.total_agents}</Text>
                  <Text style={styles.statLabel}>Total Agents</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="pulse" size={24} color="#22C55E" />
                  <Text style={styles.statValue}>{snapshot.active_today}</Text>
                  <Text style={styles.statLabel}>Active Today</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="school" size={24} color="#F59E0B" />
                  <Text style={styles.statValue}>{snapshot.needs_coaching}</Text>
                  <Text style={styles.statLabel}>Need Coaching</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="alert-circle" size={24} color="#EF4444" />
                  <Text style={styles.statValue}>{snapshot.overdue_leads}</Text>
                  <Text style={styles.statLabel}>Overdue Tasks</Text>
                </View>
              </View>
            </View>

            {/* Top Producers */}
            {snapshot.top_producers && snapshot.top_producers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Top Producers This Month</Text>
                {snapshot.top_producers.map((producer, index) => (
                  <TouchableOpacity
                    key={producer.id}
                    style={styles.topProducerCard}
                    onPress={() => router.push(`/command-center/${producer.id}`)}
                  >
                    <View style={[styles.rankBadge, index === 0 && styles.rankBadgeGold]}>
                      <Text style={styles.rankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.topProducerInfo}>
                      <Text style={styles.topProducerName}>{producer.name}</Text>
                      <Text style={styles.topProducerAmount}>
                        {formatCurrency(producer.total)} production
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#64748B" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Team Totals */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Team Performance</Text>
              <View style={styles.teamTotalsCard}>
                <View style={styles.teamTotalRow}>
                  <View style={styles.teamTotalItem}>
                    <Text style={styles.teamTotalLabel}>Total Leads</Text>
                    <Text style={styles.teamTotalValue}>
                      {agents.reduce((sum, a) => sum + a.leads_count, 0)}
                    </Text>
                  </View>
                  <View style={styles.teamTotalItem}>
                    <Text style={styles.teamTotalLabel}>Total Appointments</Text>
                    <Text style={styles.teamTotalValue}>
                      {agents.reduce((sum, a) => sum + a.appointments_scheduled + a.appointments_completed, 0)}
                    </Text>
                  </View>
                </View>
                <View style={styles.teamTotalRow}>
                  <View style={styles.teamTotalItem}>
                    <Text style={styles.teamTotalLabel}>Policies Issued</Text>
                    <Text style={styles.teamTotalValue}>
                      {agents.reduce((sum, a) => sum + a.policies_issued, 0)}
                    </Text>
                  </View>
                  <View style={styles.teamTotalItem}>
                    <Text style={styles.teamTotalLabel}>Total Production</Text>
                    <Text style={[styles.teamTotalValue, { color: '#22C55E' }]}>
                      {formatCurrency(agents.reduce((sum, a) => sum + a.total_premium, 0))}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {activeTab === 'agents' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Team Members ({agents.length})</Text>
            {agents.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#64748B" />
                <Text style={styles.emptyText}>No agents found</Text>
              </View>
            ) : (
              agents.map((agent) => {
                const activity = getActivityStatus(agent.last_login);
                return (
                  <TouchableOpacity
                    key={agent.id}
                    style={styles.agentCard}
                    onPress={() => router.push(`/command-center/${agent.id}`)}
                  >
                    <View style={styles.agentHeader}>
                      <View style={styles.agentInfo}>
                        <View style={styles.agentAvatar}>
                          <Text style={styles.agentAvatarText}>
                            {agent.name.charAt(0).toUpperCase()}
                          </Text>
                          <View style={[styles.activityDot, { backgroundColor: activity.color }]} />
                        </View>
                        <View>
                          <View style={styles.agentNameRow}>
                            <Text style={styles.agentName}>{agent.name}</Text>
                            {agent.scorecard_grade && (
                              <View style={[styles.gradeBadge, { backgroundColor: GRADE_COLORS[agent.scorecard_grade] || '#64748B' }]}>
                                <Text style={styles.gradeText}>{agent.scorecard_grade}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.agentEmail}>{agent.email}</Text>
                          <Text style={styles.agentLastLogin}>
                            Last active: {getLastLoginText(agent.last_login)}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#64748B" />
                    </View>
                    
                    <View style={styles.agentStats}>
                      <View style={styles.agentStatItem}>
                        <Text style={styles.agentStatValue}>{agent.leads_count}</Text>
                        <Text style={styles.agentStatLabel}>Leads</Text>
                      </View>
                      <View style={styles.agentStatDivider} />
                      <View style={styles.agentStatItem}>
                        <Text style={styles.agentStatValue}>{agent.appointments_completed}</Text>
                        <Text style={styles.agentStatLabel}>Completed</Text>
                      </View>
                      <View style={styles.agentStatDivider} />
                      <View style={styles.agentStatItem}>
                        <Text style={styles.agentStatValue}>{agent.policies_issued}</Text>
                        <Text style={styles.agentStatLabel}>Policies</Text>
                      </View>
                      <View style={styles.agentStatDivider} />
                      <View style={styles.agentStatItem}>
                        <Text style={[styles.agentStatValue, { color: '#22C55E' }]}>
                          {formatCurrency(agent.total_premium)}
                        </Text>
                        <Text style={styles.agentStatLabel}>Production</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'leaderboard' && (
          <View style={styles.section}>
            <View style={styles.leaderboardHeader}>
              <Text style={styles.sectionTitle}>Leaderboard</Text>
              <View style={styles.periodSelector}>
                {(['day', 'week', 'month'] as const).map((period) => (
                  <TouchableOpacity
                    key={period}
                    style={[styles.periodButton, leaderboardPeriod === period && styles.periodButtonActive]}
                    onPress={() => setLeaderboardPeriod(period)}
                  >
                    <Text style={[styles.periodButtonText, leaderboardPeriod === period && styles.periodButtonTextActive]}>
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            {leaderboard.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="trophy-outline" size={48} color="#64748B" />
                <Text style={styles.emptyText}>No production data for this period</Text>
              </View>
            ) : (
              leaderboard.map((entry, index) => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.leaderboardCard}
                  onPress={() => router.push(`/command-center/${entry.id}`)}
                >
                  <View style={[
                    styles.leaderboardRank,
                    index === 0 && styles.leaderboardRankGold,
                    index === 1 && styles.leaderboardRankSilver,
                    index === 2 && styles.leaderboardRankBronze,
                  ]}>
                    {index < 3 ? (
                      <Ionicons name="trophy" size={16} color="#FFFFFF" />
                    ) : (
                      <Text style={styles.leaderboardRankText}>{entry.rank}</Text>
                    )}
                  </View>
                  <View style={styles.leaderboardInfo}>
                    <Text style={styles.leaderboardName}>{entry.name}</Text>
                    <View style={styles.leaderboardMeta}>
                      <Text style={styles.leaderboardMetaText}>
                        {entry.policies} policies • {entry.appointments_completed} appts
                      </Text>
                    </View>
                  </View>
                  <View style={styles.leaderboardAmount}>
                    <Text style={styles.leaderboardPremium}>{formatCurrency(entry.premium)}</Text>
                    <Text style={styles.leaderboardCommission}>
                      {formatCurrency(entry.commission)} comm
                    </Text>
                  </View>
                </TouchableOpacity>
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
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
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
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F620',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    gap: 4,
  },
  roleBadgeText: {
    color: '#3B82F6',
    fontSize: 10,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#3B82F620',
  },
  tabText: {
    color: '#64748B',
    fontSize: 13,
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
    fontWeight: '600',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  topProducerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankBadgeGold: {
    backgroundColor: '#F59E0B',
  },
  rankText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  topProducerInfo: {
    flex: 1,
  },
  topProducerName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  topProducerAmount: {
    color: '#22C55E',
    fontSize: 13,
    marginTop: 2,
  },
  teamTotalsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
  },
  teamTotalRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  teamTotalItem: {
    flex: 1,
  },
  teamTotalLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  teamTotalValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
  agentCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  agentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  agentAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  activityDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  gradeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gradeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  agentEmail: {
    color: '#94A3B8',
    fontSize: 13,
  },
  agentLastLogin: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  agentStats: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
  },
  agentStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  agentStatValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  agentStatLabel: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  agentStatDivider: {
    width: 1,
    backgroundColor: '#334155',
    marginHorizontal: 8,
  },
  leaderboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 4,
  },
  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  periodButtonActive: {
    backgroundColor: '#3B82F6',
  },
  periodButtonText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  leaderboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  leaderboardRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  leaderboardRankGold: {
    backgroundColor: '#F59E0B',
  },
  leaderboardRankSilver: {
    backgroundColor: '#94A3B8',
  },
  leaderboardRankBronze: {
    backgroundColor: '#CD7F32',
  },
  leaderboardRankText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  leaderboardMeta: {
    marginTop: 2,
  },
  leaderboardMetaText: {
    color: '#64748B',
    fontSize: 12,
  },
  leaderboardAmount: {
    alignItems: 'flex-end',
  },
  leaderboardPremium: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: '600',
  },
  leaderboardCommission: {
    color: '#94A3B8',
    fontSize: 12,
  },
});
